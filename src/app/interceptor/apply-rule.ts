// What a matched response rule gives the page, after its delay: its own body for Replace, which
// never calls the server, or the server's response (sendReal) for Server's body, its body left
// unread: the page gets the server's bytes as they are and as they arrive, never a copy made
// from their text, which a body that isn't text (an image, a download) wouldn't survive and a
// stream would never finish (fetch.ts and simulate-xhr.ts each take it their own way). The rule's
// status and headers apply last. Any other body mode counts as Server's body: rules reach the
// page as they're stored, and one saved with Merge or Script (both taken out in 0.8.0) called the
// server too.
import type { Rule } from '../../shared/api/index.ts';
import type { RuleResult } from './types.ts';

const NULL_BODY_STATUS = new Set([101, 103, 204, 205, 304]);
// Whether a response with this status has a body: a Response can't be made with one otherwise.
export const hasBody = (status: number) => !NULL_BODY_STATUS.has(status);
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

// Resolves to what a matched rule gives the page (RuleResult, types.ts). `sendReal` performs the
// real request and resolves to a fetch Response; if it fails, so does this.
export async function applyRule(
  rule: Rule,
  sendReal: () => Promise<Response>,
  signal?: AbortSignal | null,
): Promise<RuleResult> {
  const options: Partial<Rule['response']> = rule.response || {};
  const replaces = (options.bodyMode || 'replace') === 'replace';
  const delay = Math.max(0, Number(options.delay) || 0);

  if (delay) await wait(delay, signal);

  // The server's headers stay as it sent them, Content-Length and Content-Encoding too: the
  // page gets the same body it would without the rule, under the same headers.
  const server = replaces ? null : await sendReal();
  let status = server?.status ?? 200;
  let statusText = server?.statusText ?? 'OK';
  const headers = new Headers(server?.headers);
  if (!server && options.contentType) headers.set('content-type', options.contentType);

  let changed = false;
  const custom = Number(options.status);
  if (Number.isInteger(custom) && custom >= 200 && custom <= 599) {
    status = custom;
    statusText = STATUS_TEXT[custom] || '';
    changed = true;
  }
  for (const row of options.headers || []) {
    const name = row?.name?.trim();
    if (!name) continue;
    try {
      if (row.op === 'remove') headers.delete(name);
      else headers.set(name, row.value ?? '');
      changed = true;
    } catch {
      // Invalid header name or value; skip it.
    }
  }
  return {
    status,
    statusText,
    headers,
    body: server || !hasBody(status) ? null : (options.body ?? ''),
    server,
    changed,
    action: replaces ? 'mocked' : 'modified',
  };
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
