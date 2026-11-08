// The requests the page makes, as entries for the tab's traffic log (sent with report()). Bodies
// are kept as text only, none from event streams: a response's up to 1 MB, not read at all past
// 5 MB by its Content-Length, and a request's up to 100 KB. Only that 1 MB of a response is ever
// held here (readBody()).
import type { EntryKind, LogEntry, Rule } from '../../shared/api/index.ts';
import { report } from './page-channel.ts';
import type { PageRequest, RuleResult } from './types.ts';

const MAX_BODY = 1_000_000;
const MAX_REQUEST_BODY = 100_000;
const MAX_CAPTURE = 5_000_000;
const TEXT_TYPE = /json|text|xml|javascript|graphql|x-www-form-urlencoded/i;

let sequence = 0;

export function makeEntry(
  kind: EntryKind,
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

export function ruleFields(rule: Rule) {
  return {
    ruleId: rule.id,
    ruleName:
      rule.name?.trim() ||
      rule.match?.graphqlOperation ||
      rule.match?.url ||
      'Untitled rule',
  };
}

export function ruleEntry(
  kind: EntryKind,
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
  });
}

export function logResponse(
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
  readBody(copy, size > 0).then(
    (text) => report(makeEntry(kind, request, started, { ...base, ...clipBody(text) })),
    () => report(makeEntry(kind, request, started, base)),
  );
}

// The copy's text, kept only as far as the log keeps it (MAX_BODY characters). A response with a
// Content-Length (5 MB at most, logResponse()) is still read to its end, so the entry's duration is
// the whole response's, its text past that point dropped as it arrives. One without, which is what
// a stream is, has its copy cancelled there and is logged at once: a stream that doesn't end shows
// up, and holds no more than that here. Cancelling the copy leaves the page's own body as it was.
async function readBody(copy: Response, toTheEnd: boolean) {
  const reader = copy.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    if (text.length > MAX_BODY) continue;
    text += decoder.decode(value, { stream: true });
    if (text.length > MAX_BODY && !toTheEnd) {
      reader.cancel().catch(() => {});
      return text;
    }
  }
}

export function canCapture(contentType: string) {
  return (
    !/event-stream/i.test(contentType) && (!contentType || TEXT_TYPE.test(contentType))
  );
}

export function clipBody(text: unknown) {
  const value = typeof text === 'string' ? text : '';
  return value.length > MAX_BODY
    ? { responseBody: value.slice(0, MAX_BODY), truncated: true }
    : { responseBody: value, truncated: false };
}
