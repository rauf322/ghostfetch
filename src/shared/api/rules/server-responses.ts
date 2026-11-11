// The server's response a rule's body is compared with in its Diff: the one the rule was made from
// (Mock this response, in Traffic or New rule), or else the newest the editor sees the server give
// a request the rule matches when no rule answered it (the rule was off, or Ghostfetch). A rule has
// Diff once it has one. Kept apart from the rules, in chrome.storage.local: so it never goes to a page with
// the rules, isn't in an exported rules file, and an edit to a rule doesn't write it again. Each
// under a key of its own, `serverResponse:` and the rule's id: every open editor (a side panel in
// each window, a tab) keeps responses as it sees them, and one writing them all at once would undo
// what another just kept. Only the editor reads them.
import { createStore, formatJson } from '../../lib/index.ts';
import type { LogEntry } from '../log-entry.ts';
import { graphqlOperation } from './rule-from-entry.ts';
import { ruleStore } from './store.ts';
import type { Rule } from './types.ts';
import { urlTester } from './url-match.ts';

export interface ServerResponse {
  // As the rule's body starts out from it: pretty-printed if it's JSON, Format's way.
  body: string;
  // The status the server gave; null if what's stored has none.
  status: number | null;
  // When the request the server gave it to was sent (the log's time for it).
  time: number;
  // Over 1 MB, of which the log keeps the first 1 MB.
  truncated: boolean;
}

const PREFIX = 'serverResponse:';
const state: { responses: Record<string, ServerResponse> } = { responses: {} };
export const responseStore = /* @__PURE__ */ createStore(state);

// After the rules (initRules): a response whose rule is gone is dropped here, rather than when the
// rule is deleted, so Undo brings the rule back with it.
export async function initServerResponses() {
  const stored = await chrome.storage.local.get(null);
  const ids = new Set(ruleStore.state.rules.map((rule) => rule.id));
  const gone: string[] = [];
  for (const [key, value] of Object.entries(stored)) {
    if (!key.startsWith(PREFIX)) continue;
    const id = key.slice(PREFIX.length);
    const response = normalizeResponse(id, value);
    if (response && ids.has(id)) state.responses[id] = response;
    else gone.push(key);
  }
  if (gone.length) chrome.storage.local.remove(gone);
  // Kept or dropped in another view (this view's own writes come back too, as they are).
  chrome.storage.onChanged.addListener((changed, area) => {
    if (area !== 'local') return;
    let any = false;
    for (const [key, { newValue }] of Object.entries(changed)) {
      if (!key.startsWith(PREFIX)) continue;
      const id = key.slice(PREFIX.length);
      const response = newValue === undefined ? null : normalizeResponse(id, newValue);
      if (response) state.responses[id] = response;
      else delete state.responses[id];
      any = true;
    }
    if (any) responseStore.emit();
  });
}

function save(id: string) {
  chrome.storage.local.set({ [PREFIX + id]: state.responses[id] });
}

export function serverResponse(id: string): ServerResponse | null {
  return state.responses[id] ?? null;
}

export function keepServerResponse(id: string, response: ServerResponse) {
  state.responses[id] = response;
  save(id);
  responseStore.emit();
}

// A copy of a rule (Duplicate) is compared with the same response.
export function copyServerResponse(from: string, to: string) {
  const response = serverResponse(from);
  if (response) keepServerResponse(to, { ...response });
}

// Whether a logged request got the server's own response: no rule answered it ('mocked'), changed
// it ('modified') or failed on it ('error'), and the server sent one. Only that is kept as the
// server's: a rule made from another rule's answer (Mock this response on a request Traffic shows
// as Mocked) gets the server's later, from capture.
export function fromServer(entry: Pick<LogEntry, 'action' | 'status' | 'error'>) {
  return !entry.action && Boolean(entry.status) && !entry.error;
}

export function responseFromEntry(entry: LogEntry): ServerResponse {
  return {
    body: formatJson(entry.responseBody) ?? entry.responseBody,
    status: entry.status,
    time: entry.time,
    truncated: entry.truncated,
  };
}

// Whether a logged request is one `rule` matches, as the page decides
// (app/interceptor/matching.ts): its method, its URL by the rule's pattern (urlTester), and for
// GraphQL its operation, named in the body or else the URL's operationName. Made into a test once
// per rule. A pattern that doesn't compile matches nothing, as in the page.
export function entryTester(rule: Rule) {
  const { method, graphqlOperation: wanted } = rule.match;
  const operation = wanted.trim();
  let url: (candidate: string) => boolean;
  try {
    url = urlTester(rule.match);
  } catch {
    return () => false;
  }
  return (entry: Pick<LogEntry, 'method' | 'url' | 'requestBody'>) =>
    (method === 'ANY' || method === entry.method) &&
    url(entry.url) &&
    (!operation || operationOf(entry) === operation);
}

function operationOf({ url, requestBody }: Pick<LogEntry, 'url' | 'requestBody'>) {
  const named = requestBody ? graphqlOperation(requestBody) : '';
  if (named) return named;
  try {
    return new URL(url).searchParams.get('operationName') || '';
  } catch {
    return '';
  }
}

// Fills in, for each rule that has no server's response yet, the newest request in the log it
// matches that no rule answered: the server's own response. Each request is looked at once, and
// the whole log again when the rules change (a rule just made may match a request from before).
export function createResponseCapture() {
  const seen = new Set<string>();
  const forget = ruleStore.subscribe(() => seen.clear());
  return {
    scan(entries: LogEntry[]) {
      const missing = ruleStore.state.rules
        .filter((rule) => !state.responses[rule.id])
        .map((rule) => ({ rule, matches: entryTester(rule) }));
      const kept: string[] = [];
      // The log keeps 500 requests; over a long session the ones looked at would pile up.
      if (seen.size > 5000) seen.clear();
      for (let index = entries.length - 1; index >= 0; index--) {
        const entry = entries[index]!;
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        if (!fromServer(entry)) continue;
        for (const { rule, matches } of missing) {
          if (state.responses[rule.id] || !matches(entry)) continue;
          state.responses[rule.id] = responseFromEntry(entry);
          kept.push(rule.id);
        }
      }
      for (const id of kept) save(id);
      if (kept.length) responseStore.emit();
    },
    stop: forget,
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Rebuilt field by field, as the rules are (normalizeRule): storage another version wrote, or
// changed by hand, can't put anything unexpected in front of the screens. Null if it isn't one.
function normalizeResponse(id: string, raw: unknown): ServerResponse | null {
  if (!/^[\w-]{1,64}$/.test(id) || !isObject(raw) || typeof raw.body !== 'string')
    return null;
  const status = Number(raw.status);
  return {
    body: raw.body,
    status:
      raw.status !== null && Number.isInteger(status) && status >= 100 && status <= 999
        ? status
        : null,
    time: typeof raw.time === 'number' && Number.isFinite(raw.time) ? raw.time : 0,
    truncated: raw.truncated === true,
  };
}
