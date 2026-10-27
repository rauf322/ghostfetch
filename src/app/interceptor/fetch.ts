// window.fetch, wrapped. A request that a response rule matches gets the rule's response; any
// other goes to the network as it would have, logged while recording. Either way it waits for the
// rules first (page-channel.ts).
import { applyRule } from './apply-rule.ts';
import { logResponse, makeEntry, ruleEntry, ruleFields } from './log-entries.ts';
import { findRule } from './matching.ts';
import { isReady, pageRules, report, whenReady } from './page-channel.ts';
import { absoluteUrl, describeBody, errorText } from './request.ts';
import type { PageRequest } from './types.ts';

// The browser's own fetch, taken as this script starts, before any page script. The
// XMLHttpRequests a rule answers make their real requests with it too (simulate-xhr.ts).
export const nativeFetch = window.fetch;

export function wrapFetch() {
  window.fetch = async function fetch(input: RequestInfo | URL, init?: RequestInit) {
    if (!isReady()) await whenReady;
    const request = await describeFetch(input, init);
    const rule = findRule(pageRules(), request);
    const started = performance.now();

    if (!rule) {
      if (!pageRules().record) return nativeFetch.call(window, input, init);
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
}

async function describeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<PageRequest> {
  const isRequest = input instanceof Request;
  const url = absoluteUrl(isRequest ? input.url : input);
  const method = String(init?.method || (isRequest ? input.method : 'GET')).toUpperCase();
  let body = '';
  if (init?.body != null) {
    body = describeBody(init.body);
  } else if (
    isRequest &&
    pageRules().needsBody &&
    method !== 'GET' &&
    method !== 'HEAD'
  ) {
    try {
      body = await input.clone().text();
    } catch {
      body = '';
    }
  }
  return { url, method, body };
}
