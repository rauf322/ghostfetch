// window.fetch, wrapped. A request that a response rule matches gets the rule's response
// (pageResponse()); any other goes to the network as it would have, logged while recording. Either
// way it waits for the rules first (page-channel.ts).
import { applyRule, hasBody } from './apply-rule.ts';
import { logResponse, makeEntry, ruleEntry, ruleFields } from './log-entries.ts';
import { findRule } from './matching.ts';
import { isReady, pageRules, report, whenReady } from './page-channel.ts';
import { absoluteUrl, describeBody, errorText } from './request.ts';
import type { PageRequest, RuleResult } from './types.ts';

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
      const response = pageResponse(result, request.url);
      // The server's body is logged as any response's is: its text, from a copy, as it arrives.
      if (!result.server) report(ruleEntry('fetch', request, started, rule, result));
      else if (pageRules().record)
        logResponse('fetch', request, response, started, {
          ...ruleFields(rule),
          action: result.action,
        });
      return response;
    } catch (problem) {
      // A request the page gave up on (it aborted it, or its own time limit ran out) isn't the
      // rule's error: it's logged as any aborted request is, under the rule that matched it.
      report(
        makeEntry('fetch', request, started, {
          ...ruleFields(rule),
          action: signal?.aborted ? '' : 'error',
          error: errorText(problem),
        }),
      );
      throw problem;
    }
  };
}

// The response a rule's result is for the page. Replace: a new one with the rule's body. Server's
// body: the server's own response where the rule sets no status and no header (one that only
// delays), or can't: an opaque response (a no-cors request's) shows the page neither, and a new
// response can't be made with its status, 0, nor with any other outside 200 to 599. Otherwise a new
// one around the server's body, which nothing here reads: the page reads the server's bytes, as
// they arrive.
function pageResponse(result: RuleResult, url: string) {
  const { server, status } = result;
  if (
    server &&
    (!result.changed || server.type.startsWith('opaque') || status < 200 || status > 599)
  )
    return server;
  let body: BodyInit | null = result.body;
  if (server) {
    body = hasBody(status) ? server.body : null;
    // A status that has no body, set over a response that has one: the server's goes unread.
    if (!body) server.body?.cancel().catch(() => {});
  }
  const response = new Response(body, {
    status,
    statusText: result.statusText,
    headers: result.headers,
  });
  // A response made here has no URL of its own, and no type: it gets the server's, or for
  // Replace the URL the page asked for.
  Object.defineProperty(response, 'url', { value: server?.url || url });
  if (server) {
    Object.defineProperty(response, 'type', { value: server.type });
    Object.defineProperty(response, 'redirected', { value: server.redirected });
  }
  return response;
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
