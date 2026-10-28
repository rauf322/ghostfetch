// What a matched response rule gives the page, after its delay: its own body for Replace, which
// never calls the server, or for Merge JSON, Script and Original the real response (sendReal),
// changed. If a merge or a script fails, the page gets the real response and the log says why.
// The rule's status and headers apply last.
import type { EntryAction, Rule } from '../../shared/api/index.ts';
import type { PageRequest, RuleResult } from './types.ts';

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

class RuleError extends Error {}

// Resolves to { status, statusText, headers, body, action, error } for a matched rule.
// `sendReal` performs the real request and resolves to a fetch Response.
export async function applyRule(
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
