// Answers an XMLHttpRequest that a response rule matched, instead of the network: the real
// request (if the rule needs it) goes through fetch, and the XMLHttpRequest's state, response
// getters and events are played back from the result, in the order a real one fires them. The
// server's body, where the rule keeps it, is held as the bytes it came as, and read the way the
// XMLHttpRequest's responseType asks for it.
import type { Rule } from '../../shared/api/index.ts';
import { applyRule, hasBody } from './apply-rule.ts';
import { nativeFetch } from './fetch.ts';
import { canCapture, makeEntry, ruleEntry, ruleFields } from './log-entries.ts';
import { pageRules, report } from './page-channel.ts';
import { errorText } from './request.ts';
import type { PageRequest, RuleResult, XhrBody, XhrMeta } from './types.ts';

// How much of the server's body is read as text for the log: more than the log keeps of a body,
// 1 MB of text, whatever its characters take.
const LOGGED_BYTES = 4_000_000;

// What simulateXhr() defines on the XMLHttpRequest, over its own getters and methods.
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

export function simulateXhr(
  xhr: XMLHttpRequest,
  meta: XhrMeta,
  rule: Rule,
  request: PageRequest,
  rawBody: XhrBody,
) {
  const started = performance.now();
  const controller = new AbortController();
  let readyState = 1;
  let result: RuleResult | null = null;
  // The server's body, for a rule that keeps it: all of its bytes, as an XMLHttpRequest that has
  // loaded has them. null for a rule's own body, which is text (result.body).
  let bytes: ArrayBuffer | null = null;
  // The body as text, worked out when it's first asked for, and as xhr.response.
  let text: string | undefined;
  let converted: unknown;
  meta.simulated = true;

  const contentType = () => result!.headers.get('content-type') || '';
  const bodyText = () =>
    (text ??= bytes ? decode(bytes, contentType()) : (result!.body ?? ''));
  // The body the way a responseType asks for it.
  const convert = (responseType: XMLHttpRequestResponseType) => {
    const own = result!.body ?? '';
    switch (responseType) {
      case 'json':
        try {
          // JSON is read as UTF-8, whatever charset the response names.
          return JSON.parse(bytes ? new TextDecoder().decode(bytes) : own);
        } catch {
          return null;
        }
      case 'arraybuffer':
        return bytes ?? new TextEncoder().encode(own).buffer;
      case 'blob':
        return new Blob([bytes ?? own], { type: contentType() });
      case 'document': {
        const type =
          /html/.test(contentType()) || !/xml/.test(contentType())
            ? 'text/html'
            : 'application/xml';
        return new DOMParser().parseFromString(bodyText(), type);
      }
      default:
        return bodyText();
    }
  };

  const define = (name: string, get: () => unknown) =>
    Object.defineProperty(xhr, name, { configurable: true, get });
  const done = () => readyState === 4 && result;
  define('readyState', () => readyState);
  define('status', () => (readyState >= 2 && result ? result.status : 0));
  define('statusText', () => (readyState >= 2 && result ? result.statusText : ''));
  // Where the server's response came from in the end, after any redirect, as fetch has it.
  define('responseURL', () => (result ? result.server?.url || request.url : ''));
  define('responseText', () => {
    if (xhr.responseType !== '' && xhr.responseType !== 'text') {
      throw new DOMException(
        "responseText is only available if responseType is '' or 'text'.",
        'InvalidStateError',
      );
    }
    return done() ? bodyText() : '';
  });
  define('response', () => {
    if (!done())
      return xhr.responseType === '' || xhr.responseType === 'text' ? '' : null;
    if (converted === undefined) converted = convert(xhr.responseType);
    return converted;
  });
  define('responseXML', () => {
    if (!done() || (xhr.responseType !== '' && xhr.responseType !== 'document'))
      return null;
    return /xml|html/.test(contentType()) ? convert('document') : null;
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
      return [...result.headers].map(([name, value]) => `${name}: ${value}\r\n`).join('');
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

  // The page's own limit on the request: xhr.timeout, as it stands when the request is sent. The
  // browser only keeps it for a request it sends itself, so it's kept here. Once it has passed,
  // the request ends as a real one does, with timeout and loadend and no response, whether it was
  // the rule's delay or the server that took too long: a delay is there to show such a timeout.
  const limit = xhr.timeout;
  const timer =
    limit > 0
      ? setTimeout(() => {
          if (meta.aborted || meta.finished) return;
          meta.finished = true;
          controller.abort();
          result = null;
          readyState = 4;
          fire('readystatechange');
          progress('timeout');
          progress('loadend');
          report(
            makeEntry('xhr', request, started, {
              ...ruleFields(rule),
              action: 'error',
              error: `Timed out after ${limit} ms, the page's own limit (xhr.timeout)`,
            }),
          );
        }, limit)
      : undefined;

  meta.abortSimulation = () => {
    if (meta.aborted || meta.finished) return;
    meta.aborted = true;
    clearTimeout(timer);
    controller.abort();
    result = null;
    readyState = 4;
    fire('readystatechange');
    progress('abort');
    progress('loadend');
    readyState = 0;
  };

  const sendReal = () => {
    const sendsBody =
      request.method !== 'GET' && request.method !== 'HEAD' && rawBody != null;
    return nativeFetch.call(window, request.url, {
      method: request.method,
      headers: meta.headers,
      body: sendsBody
        ? rawBody instanceof Document
          ? new XMLSerializer().serializeToString(rawBody)
          : rawBody
        : undefined,
      credentials: xhr.withCredentials ? 'include' : 'same-origin',
      signal: controller.signal,
    });
  };

  // The rule's result and, where it keeps the server's body, all of that body's bytes: an
  // XMLHttpRequest has every one of them when it loads. A status that has no body leaves the
  // server's unread.
  const answer = async () => {
    const outcome = await applyRule(rule, sendReal, controller.signal);
    const { server } = outcome;
    if (server && hasBody(outcome.status))
      return [outcome, await server.arrayBuffer()] as const;
    server?.body?.cancel().catch(() => {});
    return [outcome, null] as const;
  };

  progress('loadstart');
  answer().then(
    ([outcome, kept]) => {
      // Aborted, or timed out, while the answer was on its way.
      if (meta.aborted || meta.finished) return;
      clearTimeout(timer);
      meta.finished = true;
      result = outcome;
      bytes = kept;
      // What the log keeps is text: the rule's own body, or the server's if it's text. That's
      // read here, before the page has the bytes: a page that takes them as an array buffer may
      // hand it on (to a worker), which leaves it empty. A body up to LOGGED_BYTES is read whole,
      // and is then what the page gets if it asks for text; of a longer one, only its start.
      let logged = outcome.body ?? '';
      if (kept) {
        logged = '';
        if (pageRules().record && canCapture(contentType())) {
          if (kept.byteLength > LOGGED_BYTES)
            logged = decode(kept.slice(0, LOGGED_BYTES), contentType());
          else logged = bodyText();
        }
      }
      const size = kept ? kept.byteLength : (outcome.body?.length ?? 0);
      readyState = 2;
      fire('readystatechange');
      readyState = 3;
      fire('readystatechange');
      progress('progress', size);
      readyState = 4;
      fire('readystatechange');
      progress('load', size);
      progress('loadend', size);
      report(ruleEntry('xhr', request, started, rule, outcome, logged));
    },
    (problem) => {
      if (meta.aborted || meta.finished) return;
      clearTimeout(timer);
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

// An XMLHttpRequest that's opened again after simulateXhr() answered it is a real one again.
export function forgetSimulation(xhr: XMLHttpRequest) {
  for (const name of OVERRIDES) delete (xhr as unknown as Record<string, unknown>)[name];
}

// Bytes as text, the way an XMLHttpRequest reads a response: in the charset its Content-Type
// names, and as UTF-8 when it names none, or one the browser doesn't know. (fetch reads UTF-8
// whatever the response names.)
function decode(bytes: ArrayBuffer, contentType: string) {
  const charset = /charset\s*=\s*"?([^\s;"]+)/i.exec(contentType)?.[1];
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset || 'utf-8');
  } catch {
    decoder = new TextDecoder();
  }
  return decoder.decode(bytes);
}
