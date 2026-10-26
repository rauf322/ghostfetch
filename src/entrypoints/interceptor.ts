// Runs in the page's own JavaScript world (manifest "world": "MAIN") so it can wrap
// window.fetch and XMLHttpRequest. It has no extension APIs: bridge.ts sends it the
// response rules over a MessageChannel and receives the traffic log back the same way.
// Built as interceptor.js: WXT's wrapper runs this function at once, before any page script,
// and adds no globals of its own.
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import type { EntryAction, LogEntry } from '../lib/messages.ts';
import type { Rule } from '../lib/store.ts';

export default defineUnlistedScript(() => {
  'use strict';
  // A request as the rules see it.
  interface PageRequest {
    url: string;
    method: string;
    body: string;
  }
  // What a matched rule gives the page, and what it did.
  interface RuleResult {
    status: number;
    statusText: string;
    headers: Headers;
    body: string | null;
    action: EntryAction;
    error: string;
  }
  interface Compiled {
    rule: Rule;
    test: (url: string) => boolean;
  }
  // What this script keeps on each XMLHttpRequest, under a private symbol.
  interface XhrMeta {
    method: string;
    url: string;
    async: boolean;
    headers: [string, string][];
    simulated?: boolean;
    aborted?: boolean;
    finished?: boolean;
    abortSimulation?: () => void;
  }
  type XhrBody = Document | XMLHttpRequestBodyInit | null | undefined;

  // The manifest's local.* entry matches the start of the URL, which a URL with credentials
  // such as http://local.x@other.site/ passes too. Ghostfetch never runs on such URLs, and leaves
  // no trace there. The check reads document.URL because that's what the pattern is matched
  // against: Chrome strips the credentials from location.href but keeps them there.
  const address = new URL(document.URL);
  if (address.username || address.password) return;
  // Run once per page even when two registrations match it: a site you added (myapp.com) can
  // overlap a built-in host (local.myapp.com). bridge.ts has the same two guards.
  const FLAG = Symbol.for('ghostfetch.interceptor');
  if ((window as unknown as Record<symbol, boolean>)[FLAG]) return;
  Object.defineProperty(window, FLAG, { value: true });

  // This script runs before any page script, so these are still the browser's own functions.
  // The channel handoff below only ever calls these copies, never a property looked up later,
  // so a page that patches MessageEvent, EventTarget or MessagePort can't intercept it.
  const { apply } = Reflect;
  const getter = (proto: object, key: string) =>
    Object.getOwnPropertyDescriptor(proto, key)!.get!;
  const eventData = getter(MessageEvent.prototype, 'data');
  const eventPorts = getter(MessageEvent.prototype, 'ports');
  const eventSource = getter(MessageEvent.prototype, 'source');
  const setOnMessage = Object.getOwnPropertyDescriptor(
    MessagePort.prototype,
    'onmessage',
  )!.set!;
  const stopImmediate = Event.prototype.stopImmediatePropagation;
  const listen = EventTarget.prototype.addEventListener;
  const unlisten = EventTarget.prototype.removeEventListener;
  const postToPort = MessagePort.prototype.postMessage;

  const MAX_BODY = 1_000_000;
  const MAX_REQUEST_BODY = 100_000;
  const MAX_CAPTURE = 5_000_000;
  const NULL_BODY_STATUS = new Set([101, 103, 204, 205, 304]);
  const TEXT_TYPE = /json|text|xml|javascript|graphql|x-www-form-urlencoded/i;
  const STATUS_TEXT: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    202: 'Accepted',
    204: 'No Content',
    301: 'Moved Permanently',
    302: 'Found',
    304: 'Not Modified',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    410: 'Gone',
    422: 'Unprocessable Content',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };

  const nativeFetch = window.fetch;
  const xhrProto = XMLHttpRequest.prototype;
  const nativeXhr = {
    open: xhrProto.open,
    send: xhrProto.send,
    setRequestHeader: xhrProto.setRequestHeader,
    abort: xhrProto.abort,
  };

  let port: MessagePort | null = null;
  let state: {
    enabled: boolean;
    record: boolean;
    rules: Compiled[];
    needsBody: boolean;
  } = { enabled: false, record: false, rules: [], needsBody: false };
  let isReady = false;
  let markReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    markReady = () => {
      isReady = true;
      resolve();
    };
  });
  // Never hold the page's requests hostage if the bridge doesn't answer.
  setTimeout(() => markReady(), 1500);

  // bridge.ts offers its port once, before any page script runs. Accept only that first one,
  // so a page can't swap in a channel of its own later. The listener is in the capture phase
  // and registered first, so it runs ahead of every page listener on window (capture or not)
  // and stops the event before the page can see it or its port.
  // - isTrusted is an own, unforgeable property of the event, so a MessageEvent the page built
  //   and dispatched itself (which would arrive before the real offer) is ignored.
  // - The ports array is read by index, never destructured or iterated, so a page that
  //   replaced Array.prototype[Symbol.iterator] never gets to see it.
  function receivePort(event: MessageEvent) {
    if (!event.isTrusted || apply(eventSource, event, []) !== window) return;
    const offer = apply(eventData, event, []);
    const ports = apply(eventPorts, event, []);
    if (offer?.ghostfetch !== 'port' || ports.length !== 1) return;
    apply(stopImmediate, event, []);
    apply(unlisten, window, ['message', receivePort, true]);
    port = ports[0];
    apply(setOnMessage, port, [
      (message: MessageEvent) => {
        const data = apply(eventData, message, []);
        if (data?.type !== 'state') return;
        const rules = compile(data.rules || []);
        state = {
          enabled: Boolean(data.enabled),
          record: Boolean(data.record),
          rules,
          needsBody:
            Boolean(data.record) ||
            rules.some(({ rule }) => rule.match?.graphqlOperation?.trim()),
        };
        markReady();
      },
    ]);
  }
  apply(listen, window, ['message', receivePort, true]);

  // ---------------------------------------------------------------- matching

  function compile(rules: Rule[]) {
    const compiled: Compiled[] = [];
    for (const rule of rules) {
      try {
        compiled.push({ rule, test: urlTester(rule.match || {}) });
      } catch {
        // Invalid regex: the editor already shows the error, so just skip the rule.
      }
    }
    return compiled;
  }

  function urlTester({
    url = '',
    mode = 'contains',
    graphqlOperation = '',
  }: Partial<Rule['match']>): (candidate: string) => boolean {
    const pattern = url.trim();
    if (!pattern) return () => Boolean(graphqlOperation.trim());
    if (mode === 'regex') {
      const regex = new RegExp(pattern);
      return (candidate) => regex.test(candidate);
    }
    if (mode === 'wildcard') {
      const regex = new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`);
      return (candidate) => regex.test(candidate);
    }
    if (mode === 'equals') {
      return (candidate) =>
        candidate === pattern ||
        (pattern.startsWith('/') && pathOf(candidate) === pattern);
    }
    return (candidate) => candidate.includes(pattern);
  }

  function findRule(request: PageRequest) {
    if (!state.enabled) return null;
    for (const { rule, test } of state.rules) {
      const { method = 'ANY', graphqlOperation = '' }: Partial<Rule['match']> =
        rule.match || {};
      if (method !== 'ANY' && method !== request.method) continue;
      if (!test(request.url)) continue;
      if (graphqlOperation.trim() && operationName(request) !== graphqlOperation.trim())
        continue;
      return rule;
    }
    return null;
  }

  function operationName({ url, body }: PageRequest) {
    if (body) {
      try {
        const parsed = JSON.parse(body);
        const first = Array.isArray(parsed) ? parsed[0] : parsed;
        if (first?.operationName) return first.operationName;
        const named = /^\s*(?:query|mutation|subscription)\s+(\w+)/.exec(
          first?.query || '',
        );
        if (named) return named[1];
      } catch {
        // Not JSON, fall through to the query string.
      }
    }
    try {
      return new URL(url).searchParams.get('operationName') || '';
    } catch {
      return '';
    }
  }

  // ---------------------------------------------------------------- applying rules

  class RuleError extends Error {}

  // Resolves to { status, statusText, headers, body, action, error } for a matched rule.
  // `sendReal` performs the real request and resolves to a fetch Response.
  async function applyRule(
    rule: Rule,
    request: PageRequest,
    sendReal: () => Promise<Response>,
    signal?: AbortSignal | null,
  ): Promise<RuleResult> {
    const options: Partial<Rule['response']> = rule.response || {};
    const mode = options.bodyMode || 'replace';
    const delay = Math.max(0, Number(options.delay) || 0);
    let status = 200;
    let statusText = 'OK';
    let headers = new Headers();
    let body: string | null = '';
    let action: EntryAction = mode === 'replace' ? 'mocked' : 'modified';
    let error = '';

    if (delay) await wait(delay, signal);

    if (mode === 'replace') {
      body = options.body ?? '';
      if (options.contentType) headers.set('content-type', options.contentType);
    } else {
      const real = await sendReal();
      const text = await real.text();
      status = real.status;
      statusText = real.statusText;
      headers = new Headers(real.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      try {
        if (mode === 'merge') {
          const merged = deepMerge(
            parseJson(text, 'The server response'),
            parseJson(options.merge!, 'The merge JSON'),
          );
          body = JSON.stringify(merged);
        } else if (mode === 'script') {
          body = await runScript(options.script || '', text, request, status);
        } else {
          body = text;
        }
      } catch (problem) {
        // Fall back to the untouched response so the page keeps working, and say why.
        body = text;
        action = 'error';
        error =
          problem instanceof RuleError
            ? problem.message
            : `Rule failed: ${(problem as Error).message}`;
      }
    }

    const custom = Number(options.status);
    if (Number.isInteger(custom) && custom >= 200 && custom <= 599) {
      status = custom;
      statusText = STATUS_TEXT[custom] || '';
    }
    for (const row of options.headers || []) {
      const name = row?.name?.trim();
      if (!name) continue;
      try {
        if (row.op === 'remove') headers.delete(name);
        else headers.set(name, row.value ?? '');
      } catch {
        // Invalid header name or value; skip it.
      }
    }
    if (NULL_BODY_STATUS.has(status)) body = null;
    return { status, statusText, headers, body, action, error };
  }

  function parseJson(text: string, label: string) {
    try {
      return JSON.parse(text);
    } catch (problem) {
      throw new RuleError(`${label} is not valid JSON: ${(problem as Error).message}`);
    }
  }

  function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  // Objects merge key by key; arrays and plain values in the patch replace the original.
  function deepMerge(base: unknown, patch: unknown): unknown {
    if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
    const merged = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      merged[key] = key in base ? deepMerge(base[key], value) : value;
    }
    return merged;
  }

  async function runScript(
    code: string,
    text: string,
    request: PageRequest,
    status: number,
  ) {
    let response: unknown;
    try {
      response = JSON.parse(text);
    } catch {
      response = text;
    }
    let transform: Function;
    try {
      // eslint-disable-next-line no-new-func
      transform = new Function(
        'response',
        'request',
        `return (async () => {\n${code}\n})();`,
      );
    } catch (problem) {
      if (problem instanceof EvalError) {
        throw new RuleError(
          "This page's Content-Security-Policy blocks scripts. Use Merge JSON or Replace instead.",
        );
      }
      throw new RuleError(`Script has a syntax error: ${(problem as Error).message}`);
    }
    let result: unknown;
    try {
      result = await transform(response, {
        url: request.url,
        method: request.method,
        body: request.body,
        status,
      });
    } catch (problem) {
      throw new RuleError(
        `Script threw an error: ${(problem as Error | undefined)?.message ?? problem}`,
      );
    }
    if (result === undefined) result = response;
    return typeof result === 'string' ? result : JSON.stringify(result);
  }

  function wait(ms: number, signal?: AbortSignal | null) {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted)
        return reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(signal!.reason ?? new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  }

  // ---------------------------------------------------------------- fetch

  window.fetch = async function fetch(input: RequestInfo | URL, init?: RequestInit) {
    if (!isReady) await ready;
    const request = await describeFetch(input, init);
    const rule = findRule(request);
    const started = performance.now();

    if (!rule) {
      if (!state.record) return nativeFetch.call(window, input, init);
      try {
        const response = await nativeFetch.call(window, input, init);
        logResponse('fetch', request, response, started);
        return response;
      } catch (problem) {
        report(makeEntry('fetch', request, started, { error: errorText(problem) }));
        throw problem;
      }
    }

    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    try {
      const result = await applyRule(
        rule,
        request,
        () => nativeFetch.call(window, input, init),
        signal,
      );
      const response = new Response(result.body, {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
      });
      Object.defineProperty(response, 'url', { value: request.url });
      report(ruleEntry('fetch', request, started, rule, result));
      return response;
    } catch (problem) {
      report(
        makeEntry('fetch', request, started, {
          ...ruleFields(rule),
          action: 'error',
          error: errorText(problem),
        }),
      );
      throw problem;
    }
  };

  async function describeFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<PageRequest> {
    const isRequest = input instanceof Request;
    const url = absoluteUrl(isRequest ? input.url : input);
    const method = String(
      init?.method || (isRequest ? input.method : 'GET'),
    ).toUpperCase();
    let body = '';
    if (init?.body != null) {
      body = describeBody(init.body);
    } else if (isRequest && state.needsBody && method !== 'GET' && method !== 'HEAD') {
      try {
        body = await input.clone().text();
      } catch {
        body = '';
      }
    }
    return { url, method, body };
  }

  // ---------------------------------------------------------------- XMLHttpRequest

  const META = Symbol('ghostfetch.xhr');
  type Tracked = XMLHttpRequest & { [META]?: XhrMeta };
  const OVERRIDES = [
    'readyState',
    'status',
    'statusText',
    'responseURL',
    'response',
    'responseText',
    'responseXML',
    'getResponseHeader',
    'getAllResponseHeaders',
  ];

  xhrProto.open = function open(
    this: Tracked,
    method: string,
    url: string | URL,
    async: boolean = true,
    ...credentials: [username?: string | null, password?: string | null]
  ) {
    const previous = this[META];
    if (previous?.simulated) {
      previous.aborted = true;
      for (const name of OVERRIDES)
        delete (this as unknown as Record<string, unknown>)[name];
    }
    this[META] = {
      method: String(method).toUpperCase(),
      url: absoluteUrl(url),
      async: async !== false,
      headers: [],
    };
    return nativeXhr.open.call(this, method, url, async, ...credentials);
  } as typeof xhrProto.open;

  xhrProto.setRequestHeader = function setRequestHeader(
    this: Tracked,
    name: string,
    value: string,
  ) {
    this[META]?.headers.push([name, value]);
    return nativeXhr.setRequestHeader.call(this, name, value);
  };

  xhrProto.abort = function abort(this: Tracked) {
    this[META]?.abortSimulation?.();
    return nativeXhr.abort.call(this);
  };

  xhrProto.send = function send(this: Tracked, body?: XhrBody) {
    const meta = this[META];
    if (!meta || !meta.async) return nativeXhr.send.call(this, body);
    if (!isReady) {
      ready.then(() => {
        try {
          this.send(body);
        } catch {
          // Aborted or reopened while waiting for the rules.
        }
      });
      return undefined;
    }
    const request = { url: meta.url, method: meta.method, body: describeBody(body) };
    const rule = findRule(request);
    if (!rule) {
      if (state.record) watchXhr(this, request);
      return nativeXhr.send.call(this, body);
    }
    simulateXhr(this, meta, rule, request, body);
    return undefined;
  };

  function watchXhr(xhr: XMLHttpRequest, request: PageRequest) {
    const started = performance.now();
    xhr.addEventListener(
      'loadend',
      () => {
        const contentType = xhr.getResponseHeader('content-type') || '';
        let responseBody = '';
        if (canCapture(contentType)) {
          try {
            if (xhr.responseType === '' || xhr.responseType === 'text')
              responseBody = xhr.responseText;
            else if (xhr.responseType === 'json')
              responseBody = JSON.stringify(xhr.response);
          } catch {
            responseBody = '';
          }
        }
        report(
          makeEntry('xhr', request, started, {
            status: xhr.status || null,
            contentType,
            ...clipBody(responseBody),
            error: xhr.status ? '' : 'Request failed or was aborted',
          }),
        );
      },
      { once: true },
    );
  }

  // Answers the XHR ourselves: the real request (if the rule needs it) goes through fetch,
  // and the XHR's state, response getters and events are played back from the result.
  function simulateXhr(
    xhr: Tracked,
    meta: XhrMeta,
    rule: Rule,
    request: PageRequest,
    rawBody: XhrBody,
  ) {
    const started = performance.now();
    const controller = new AbortController();
    let readyState = 1;
    let result: RuleResult | null = null;
    let converted: unknown;
    meta.simulated = true;

    const define = (name: string, get: () => unknown) =>
      Object.defineProperty(xhr, name, { configurable: true, get });
    const done = () => readyState === 4 && result;
    define('readyState', () => readyState);
    define('status', () => (readyState >= 2 && result ? result.status : 0));
    define('statusText', () => (readyState >= 2 && result ? result.statusText : ''));
    define('responseURL', () => (result ? request.url : ''));
    define('responseText', () => {
      if (xhr.responseType !== '' && xhr.responseType !== 'text') {
        throw new DOMException(
          "responseText is only available if responseType is '' or 'text'.",
          'InvalidStateError',
        );
      }
      return done() ? (result!.body ?? '') : '';
    });
    define('response', () => {
      if (!done())
        return xhr.responseType === '' || xhr.responseType === 'text' ? '' : null;
      if (converted === undefined)
        converted = convertBody(
          result!.body ?? '',
          result!.headers.get('content-type') || '',
          xhr.responseType,
        );
      return converted;
    });
    define('responseXML', () => {
      if (!done() || (xhr.responseType !== '' && xhr.responseType !== 'document'))
        return null;
      const type = result!.headers.get('content-type') || '';
      return /xml|html/.test(type)
        ? convertBody(result!.body ?? '', type, 'document')
        : null;
    });
    Object.defineProperty(xhr, 'getResponseHeader', {
      configurable: true,
      value: (name: string) =>
        readyState >= 2 && result ? result.headers.get(name) : null,
    });
    Object.defineProperty(xhr, 'getAllResponseHeaders', {
      configurable: true,
      value: () => {
        if (readyState < 2 || !result) return '';
        return [...result.headers]
          .map(([name, value]) => `${name}: ${value}\r\n`)
          .join('');
      },
    });

    const fire = (type: string) => xhr.dispatchEvent(new Event(type));
    const progress = (type: string, size = 0) =>
      xhr.dispatchEvent(
        new ProgressEvent(type, {
          lengthComputable: size > 0,
          loaded: size,
          total: size,
        }),
      );

    meta.abortSimulation = () => {
      if (meta.aborted || meta.finished) return;
      meta.aborted = true;
      controller.abort();
      result = null;
      readyState = 4;
      fire('readystatechange');
      progress('abort');
      progress('loadend');
      readyState = 0;
    };

    const sendReal = () => {
      const hasBody =
        request.method !== 'GET' && request.method !== 'HEAD' && rawBody != null;
      return nativeFetch.call(window, request.url, {
        method: request.method,
        headers: meta.headers,
        body: hasBody
          ? rawBody instanceof Document
            ? new XMLSerializer().serializeToString(rawBody)
            : rawBody
          : undefined,
        credentials: xhr.withCredentials ? 'include' : 'same-origin',
        signal: controller.signal,
      });
    };

    progress('loadstart');
    applyRule(rule, request, sendReal, controller.signal).then(
      (outcome) => {
        if (meta.aborted) return;
        meta.finished = true;
        result = outcome;
        const size = outcome.body?.length ?? 0;
        readyState = 2;
        fire('readystatechange');
        readyState = 3;
        fire('readystatechange');
        progress('progress', size);
        readyState = 4;
        fire('readystatechange');
        progress('load', size);
        progress('loadend', size);
        report(ruleEntry('xhr', request, started, rule, outcome));
      },
      (problem) => {
        if (meta.aborted) return;
        meta.finished = true;
        readyState = 4;
        fire('readystatechange');
        progress('error');
        progress('loadend');
        report(
          makeEntry('xhr', request, started, {
            ...ruleFields(rule),
            action: 'error',
            error: errorText(problem),
          }),
        );
      },
    );
  }

  function convertBody(
    body: string,
    contentType: string,
    responseType: XMLHttpRequestResponseType,
  ) {
    switch (responseType) {
      case 'json':
        try {
          return JSON.parse(body);
        } catch {
          return null;
        }
      case 'arraybuffer':
        return new TextEncoder().encode(body).buffer;
      case 'blob':
        return new Blob([body], { type: contentType });
      case 'document': {
        const type =
          /html/.test(contentType) || !/xml/.test(contentType)
            ? 'text/html'
            : 'application/xml';
        return new DOMParser().parseFromString(body, type);
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------- traffic log

  let sequence = 0;

  function makeEntry(
    kind: 'fetch' | 'xhr',
    request: PageRequest,
    started: number,
    extra: Partial<LogEntry> = {},
  ): LogEntry {
    return {
      id: `${Date.now().toString(36)}-${(sequence++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      time: Date.now(),
      kind,
      method: request.method,
      url: request.url,
      frame: window === window.top ? '' : location.origin,
      requestBody:
        request.body.length > MAX_REQUEST_BODY
          ? request.body.slice(0, MAX_REQUEST_BODY)
          : request.body,
      duration: Math.round(performance.now() - started),
      status: null,
      contentType: '',
      responseBody: '',
      truncated: false,
      ruleId: null,
      ruleName: '',
      action: '',
      error: '',
      ...extra,
    };
  }

  function ruleFields(rule: Rule) {
    return {
      ruleId: rule.id,
      ruleName:
        rule.name?.trim() ||
        rule.match?.graphqlOperation ||
        rule.match?.url ||
        'Untitled rule',
    };
  }

  function ruleEntry(
    kind: 'fetch' | 'xhr',
    request: PageRequest,
    started: number,
    rule: Rule,
    result: RuleResult,
  ) {
    return makeEntry(kind, request, started, {
      ...ruleFields(rule),
      status: result.status,
      contentType: result.headers.get('content-type') || '',
      ...clipBody(result.body ?? ''),
      action: result.action,
      error: result.error,
    });
  }

  function logResponse(
    kind: 'fetch',
    request: PageRequest,
    response: Response,
    started: number,
  ) {
    const contentType = response.headers.get('content-type') || '';
    const size = Number(response.headers.get('content-length')) || 0;
    // Clone before handing the response back, so the page can still read its body.
    const copy = canCapture(contentType) && size <= MAX_CAPTURE ? response.clone() : null;
    const base = { status: response.status, contentType };
    if (!copy) {
      report(makeEntry(kind, request, started, base));
      return;
    }
    copy.text().then(
      (text) => report(makeEntry(kind, request, started, { ...base, ...clipBody(text) })),
      () => report(makeEntry(kind, request, started, base)),
    );
  }

  function report(entry: LogEntry) {
    if (!state.record || !port) return;
    try {
      apply(postToPort, port, [{ type: 'log', entry }]);
    } catch {
      // Port closed (the extension was reloaded).
    }
  }

  // ---------------------------------------------------------------- helpers

  function canCapture(contentType: string) {
    return (
      !/event-stream/i.test(contentType) && (!contentType || TEXT_TYPE.test(contentType))
    );
  }

  function clipBody(text: unknown) {
    const value = typeof text === 'string' ? text : '';
    return value.length > MAX_BODY
      ? { responseBody: value.slice(0, MAX_BODY), truncated: true }
      : { responseBody: value, truncated: false };
  }

  function describeBody(body: unknown): string {
    if (body == null) return '';
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) {
      return [...body]
        .map(
          ([key, value]) =>
            `${key}=${typeof value === 'string' ? value : `[file ${value.name}]`}`,
        )
        .join('\n');
    }
    if (body instanceof Blob) return `[Blob, ${body.size} bytes]`;
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(body);
      } catch {
        return `[binary, ${body.byteLength} bytes]`;
      }
    }
    if (body instanceof ReadableStream) return '[stream]';
    if (body instanceof Document) return new XMLSerializer().serializeToString(body);
    return String(body);
  }

  function absoluteUrl(url: unknown) {
    try {
      return new URL(String(url), document.baseURI).href;
    } catch {
      return String(url);
    }
  }

  function pathOf(url: string) {
    try {
      const parsed = new URL(url);
      return parsed.pathname + parsed.search;
    } catch {
      return url;
    }
  }

  function escapeRegex(text: string) {
    return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }

  function errorText(problem: unknown) {
    return (problem as Error | undefined)?.name === 'AbortError'
      ? 'Aborted'
      : String((problem as Error | undefined)?.message || problem);
  }
});
