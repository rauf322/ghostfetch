// What a matched response rule gives the page, after its delay: its own body for Replace, which
// never calls the server, or the real response (sendReal) for Server's body. The rule's status and
// headers apply last. Any other body mode counts as Server's body: rules reach the page as they're
// stored, and one saved with Merge or Script (both taken out in 0.8.0) called the server too.
import type { Rule } from '../../shared/api/index.ts';
import type { RuleResult } from './types.ts';

const NULL_BODY_STATUS = new Set([101, 103, 204, 205, 304]);
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

// Resolves to { status, statusText, headers, body, action } for a matched rule. `sendReal`
// performs the real request and resolves to a fetch Response; if it fails, so does this.
export async function applyRule(
  rule: Rule,
  sendReal: () => Promise<Response>,
  signal?: AbortSignal | null,
): Promise<RuleResult> {
  const options: Partial<Rule['response']> = rule.response || {};
  const replaces = (options.bodyMode || 'replace') === 'replace';
  const delay = Math.max(0, Number(options.delay) || 0);
  let status = 200;
  let statusText = 'OK';
  let headers = new Headers();
  let body: string | null;

  if (delay) await wait(delay, signal);

  if (replaces) {
    body = options.body ?? '';
    if (options.contentType) headers.set('content-type', options.contentType);
  } else {
    const real = await sendReal();
    body = await real.text();
    status = real.status;
    statusText = real.statusText;
    headers = new Headers(real.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
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
  return { status, statusText, headers, body, action: replaces ? 'mocked' : 'modified' };
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
