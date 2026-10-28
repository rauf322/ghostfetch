// The requests the page makes, as entries for the tab's traffic log (sent with report()). Bodies
// are kept as text only, none from event streams: a response's up to 1 MB, not read at all past
// 5 MB by its Content-Length, and a request's up to 100 KB.
import type { LogEntry, Rule } from '../../shared/api/index.ts';
import { report } from './page-channel.ts';
import type { PageRequest, RuleResult } from './types.ts';

const MAX_BODY = 1_000_000;
const MAX_REQUEST_BODY = 100_000;
const MAX_CAPTURE = 5_000_000;
const TEXT_TYPE = /json|text|xml|javascript|graphql|x-www-form-urlencoded/i;

let sequence = 0;

export function makeEntry(
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
  copy.text().then(
    (text) => report(makeEntry(kind, request, started, { ...base, ...clipBody(text) })),
    () => report(makeEntry(kind, request, started, base)),
  );
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
