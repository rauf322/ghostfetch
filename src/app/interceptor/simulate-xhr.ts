// Answers an XMLHttpRequest that a response rule matched, instead of the network: the real
// request (if the rule needs it) goes through fetch, and the XMLHttpRequest's state, response
// getters and events are played back from the result, in the order a real one fires them.
import type { Rule } from '../../shared/api/index.ts';
import { applyRule } from './apply-rule.ts';
import { nativeFetch } from './fetch.ts';
import { makeEntry, ruleEntry, ruleFields } from './log-entries.ts';
import { report } from './page-channel.ts';
import { errorText } from './request.ts';
import type { PageRequest, RuleResult, XhrBody, XhrMeta } from './types.ts';

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

// An XMLHttpRequest that's opened again after simulateXhr() answered it is a real one again.
export function forgetSimulation(xhr: XMLHttpRequest) {
  for (const name of OVERRIDES) delete (xhr as unknown as Record<string, unknown>)[name];
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
