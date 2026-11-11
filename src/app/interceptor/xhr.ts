// XMLHttpRequest, wrapped. open() notes the method and URL, setRequestHeader() the headers, and
// send() lets the request go to the network, logged while recording, or, when a response rule
// matches it, answers it with the rule's response (simulate-xhr.ts). Like fetch, it waits for the
// rules first. Synchronous requests always go untouched.
import { canCapture, clipBody, makeEntry } from './log-entries.ts';
import { findRule } from './matching.ts';
import { isReady, pageRules, report, whenReady } from './page-channel.ts';
import { absoluteUrl, describeBody } from './request.ts';
import { forgetSimulation, simulateXhr } from './simulate-xhr.ts';
import type { PageRequest, XhrBody, XhrMeta } from './types.ts';

const META = Symbol('ghostfetch.xhr');
type Tracked = XMLHttpRequest & { [META]?: XhrMeta };

// The browser's own methods, taken as this script starts, before any page script.
const xhrProto = XMLHttpRequest.prototype;
const nativeXhr = {
  open: xhrProto.open,
  send: xhrProto.send,
  setRequestHeader: xhrProto.setRequestHeader,
  abort: xhrProto.abort,
};

export function wrapXhr() {
  xhrProto.open = function open(
    this: Tracked,
    method: string,
    url: string | URL,
    // Whether it's asynchronous, then a user name and a password: whichever the page gave.
    ...rest: [async?: boolean, username?: string | null, password?: string | null]
  ) {
    const previous = this[META];
    if (previous?.simulated) {
      previous.aborted = true;
      forgetSimulation(this);
    }
    this[META] = {
      method: String(method).toUpperCase(),
      url: absoluteUrl(url),
      // As the browser reads it: asynchronous with no third argument, and with one, only if it's
      // true or counts as true. undefined, 0, null and '' ask for a synchronous request, as false
      // does.
      async: rest.length === 0 || Boolean(rest[0]),
      headers: [],
    };
    // With the arguments the page gave, no more and no fewer: the browser tells two from three.
    return (nativeXhr.open as (...given: unknown[]) => void).call(
      this,
      method,
      url,
      ...rest,
    );
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
    if (!isReady()) {
      whenReady.then(() => {
        try {
          this.send(body);
        } catch {
          // Aborted or reopened while waiting for the rules.
        }
      });
      return undefined;
    }
    const request = { url: meta.url, method: meta.method, body: describeBody(body) };
    const rule = findRule(pageRules(), request);
    if (!rule) {
      if (pageRules().record) watchXhr(this, request);
      return nativeXhr.send.call(this, body);
    }
    simulateXhr(this, meta, rule, request, body);
    return undefined;
  };
}

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
