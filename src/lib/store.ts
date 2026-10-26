// Rule model and storage helpers shared by the service worker, popup and editor.
// Everything lives in chrome.storage.local: { enabled, record, sites, rules, localHosts }.

export type RuleType = 'response' | 'redirect' | 'headers' | 'block';
export type Method =
  | 'ANY'
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'OPTIONS'
  | 'HEAD';
export type MatchMode = 'contains' | 'equals' | 'wildcard' | 'regex';
export type BodyMode = 'replace' | 'merge' | 'script' | 'original';

export interface HeaderRow {
  op: 'set' | 'remove';
  name: string;
  value: string;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  type: RuleType;
  match: { url: string; mode: MatchMode; method: Method; graphqlOperation: string };
  response: {
    bodyMode: BodyMode;
    body: string;
    merge: string;
    script: string;
    // '' (keep the status, or 200 for Replace) or up to three digits.
    status: string;
    delay: number;
    contentType: string;
    headers: HeaderRow[];
  };
  redirect: { to: string };
  headers: { request: HeaderRow[]; response: HeaderRow[] };
  createdAt: number;
  updatedAt: number;
}

export interface StoredState {
  enabled: boolean;
  record: boolean;
  sites: string[];
  rules: Rule[];
  localHosts: string[];
}

export const TYPES: Record<RuleType, { label: string; short: string; desc: string }> = {
  response: {
    label: 'Modify response',
    short: 'Response',
    desc: 'Replace the body, merge JSON into it, or transform it with a script',
  },
  redirect: {
    label: 'Redirect',
    short: 'Redirect',
    desc: 'Send matching requests to another URL, e.g. prod API to localhost',
  },
  headers: {
    label: 'Modify headers',
    short: 'Headers',
    desc: 'Set or remove request and response headers',
  },
  block: {
    label: 'Block',
    short: 'Block',
    desc: 'Make matching requests fail, to test error handling',
  },
};

export const METHODS: readonly Method[] = [
  'ANY',
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
];

export const MATCH_MODES: Record<MatchMode, string> = {
  contains: 'Contains',
  equals: 'Equals',
  wildcard: 'Wildcard',
  regex: 'Regex',
};

export const MATCH_HINTS: Record<MatchMode, string> = {
  contains: 'Matches when the full URL contains this text, e.g. /api/users',
  equals:
    'The full URL. Response rules also accept just the path, e.g. /api/users?page=1',
  wildcard: '* matches anything, e.g. https://api.example.com/users/*',
  regex: 'Regular expression tested against the full URL, e.g. /api/users/\\d+$',
};

export const BODY_MODES: Record<
  BodyMode,
  { label: string; short?: string; desc: string }
> = {
  replace: { label: 'Replace', desc: 'Return this body without calling the server.' },
  merge: {
    label: 'Merge JSON',
    short: 'Merge',
    desc: 'Call the server, then deep-merge this JSON into its response. Objects merge key by key; arrays and plain values are replaced.',
  },
  script: {
    label: 'Script',
    desc: 'Call the server, then transform its response with JavaScript. Needs a page without a strict Content-Security-Policy, which is the case for most dev servers.',
  },
  original: {
    label: 'Original',
    desc: 'Keep the real body. Use this to change only the status, headers or delay.',
  },
};

export const SCRIPT_TEMPLATE = `// \`response\` is the real response: parsed JSON, or text if it isn't JSON.
// \`request\` is { url, method, body, status }.
// Return what the page should receive. Objects are sent as JSON.
// If you return nothing, the (possibly mutated) \`response\` is used.

return response;
`;

// Ghostfetch always runs on these hosts (localhost also covers *.localhost) and on hosts whose
// name starts with "local." (see isLocalPrefixHost); the manifest's content_scripts declare
// them. On top of that it runs on the sites you add, whose content scripts background.ts
// registers at runtime, so any other site never sees Ghostfetch.
export const BUILT_IN_SITES = ['localhost', '127.0.0.1'];

// Hosts like local.myapp.com, the usual name for a dev build of a real domain.
const LOCAL_PREFIX = /^local\.[a-z0-9]/;

export function isLocalPrefixHost(host: string) {
  return LOCAL_PREFIX.test(host);
}

const DEFAULTS: StoredState = {
  enabled: true,
  record: true,
  sites: [],
  rules: [],
  localHosts: [],
};

export function createRule(type: RuleType = 'response'): Rule {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: '',
    enabled: true,
    type,
    match: { url: '', mode: 'contains', method: 'ANY', graphqlOperation: '' },
    response: {
      bodyMode: 'replace',
      body: '{\n  \n}',
      merge: '{\n  \n}',
      script: SCRIPT_TEMPLATE,
      status: '',
      delay: 0,
      contentType: 'application/json',
      headers: [],
    },
    redirect: { to: '' },
    headers: { request: [], response: [] },
    createdAt: now,
    updatedAt: now,
  };
}

// Stored, older, imported or page-reported data: any shape at all, read one field at a time.
export type Untrusted = { [key: string]: any } | null | undefined;

// Whether `key` names one of `options` (TYPES, MATCH_MODES, BODY_MODES), checked like Object.hasOwn.
function isKey<T extends object>(options: T, key: unknown): key is keyof T {
  return Object.hasOwn(options, key as PropertyKey);
}

const isMethod = (value: unknown): value is Method =>
  (METHODS as readonly unknown[]).includes(value);

// Rebuilds a rule field by field from known keys and types, so stored, older or imported
// rules (which may come from an untrusted file) can't carry unexpected values into the UI.
export function normalizeRule(input: unknown, { newId = false } = {}): Rule {
  const raw = input as Untrusted;
  const base = createRule(isKey(TYPES, raw?.type) ? raw.type : 'response');
  const match: Untrusted = isObject(raw?.match) ? raw.match : {};
  const response: Untrusted = isObject(raw?.response) ? raw.response : {};
  const status = String(response.status ?? '');
  return {
    id:
      !newId && typeof raw?.id === 'string' && /^[\w-]{1,64}$/.test(raw.id)
        ? raw.id
        : base.id,
    name: text(raw?.name),
    enabled: raw?.enabled !== false,
    type: base.type,
    match: {
      url: text(match.url),
      mode: isKey(MATCH_MODES, match.mode) ? match.mode : 'contains',
      method: isMethod(match.method) ? match.method : 'ANY',
      graphqlOperation: text(match.graphqlOperation),
    },
    response: {
      bodyMode: isKey(BODY_MODES, response.bodyMode) ? response.bodyMode : 'replace',
      body: text(response.body, base.response.body),
      merge: text(response.merge, base.response.merge),
      script: text(response.script, base.response.script),
      status: /^\d{0,3}$/.test(status) ? status : '',
      delay: Math.min(Math.max(Math.round(Number(response.delay) || 0), 0), 600_000),
      contentType: text(response.contentType, base.response.contentType),
      headers: headerRows(response.headers),
    },
    redirect: { to: text(raw?.redirect?.to) },
    headers: {
      request: headerRows(raw?.headers?.request),
      response: headerRows(raw?.headers?.response),
    },
    createdAt: Number.isFinite(raw?.createdAt) ? raw!.createdAt : base.createdAt,
    updatedAt: Number.isFinite(raw?.updatedAt) ? raw!.updatedAt : base.updatedAt,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function headerRows(rows: unknown): HeaderRow[] {
  return (Array.isArray(rows) ? rows : []).filter(isObject).map((row) => ({
    op: row.op === 'remove' ? 'remove' : 'set',
    name: text(row.name),
    value: text(row.value),
  }));
}

// ---------------------------------------------------------------- sites

export function siteOf(url: string | undefined): string {
  try {
    const parsed = new URL(url!);
    return /^https?:$/.test(parsed.protocol) ? parsed.hostname : '';
  } catch {
    return '';
  }
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

// Always on: localhost (any port or *.localhost subdomain), 127.0.0.1 and local.* hosts.
export function isBuiltInHost(host: string) {
  return (
    host === '127.0.0.1' ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    isLocalPrefixHost(host)
  );
}

// Turns "https://staging.example.com:8080/app", "*.example.com" or "Example.com" into a bare
// hostname. Returns '' for anything that isn't a plain hostname or IPv4 address.
export function normalizeSite(input: unknown): string {
  const raw = String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\*\./, '');
  if (!raw) return '';
  let host;
  try {
    host = new URL(raw.includes('://') ? raw : `http://${raw}`).hostname;
  } catch {
    return '';
  }
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host) ? host : '';
}

// The sites you added, cleaned up: plain hostnames, no duplicates, no built-in hosts
// (they're always on anyway).
export function normalizeSites(list: unknown): string[] {
  return [...new Set((Array.isArray(list) ? list : []).map(normalizeSite))].filter(
    (site) => site && !isBuiltInHost(site),
  );
}

// A site you added covers the host itself and its subdomains (IP addresses only themselves).
export function siteCovers(site: string, host: string) {
  return host === site || (!IPV4.test(site) && host.endsWith(`.${site}`));
}

// Whether Ghostfetch runs on this URL: a built-in host, or one covered by a site you added.
export function isSiteEnabled(sites: string[], url: string | undefined) {
  const host = siteOf(url);
  return (
    Boolean(host) && (isBuiltInHost(host) || sites.some((site) => siteCovers(site, host)))
  );
}

// Content-script match patterns for the sites you added.
export function siteMatchPatterns(sites: string[]) {
  return sites.map((site) => (IPV4.test(site) ? `*://${site}/*` : `*://*.${site}/*`));
}

export function ruleTitle(rule: Rule) {
  return (
    rule.name.trim() || rule.match.graphqlOperation || rule.match.url || 'Untitled rule'
  );
}

// The declarativeNetRequest urlFilter for redirect, header and block rules.
export function dnrUrlFilter(mode: MatchMode, pattern: string) {
  if (mode === 'equals') return pattern.includes('://') ? `|${pattern}|` : `${pattern}|`;
  if (mode === 'wildcard') return `|${pattern}|`;
  return pattern;
}

// Mirrors how a rule's URL pattern is applied: by the page-world interceptor for response rules
// (case-sensitive) and by Chrome's declarativeNetRequest for everything else
// (case-insensitive urlFilter syntax). Throws if the pattern is an invalid regex.
export function testUrl(rule: Rule, url: string) {
  const pattern = rule.match.url.trim();
  const { mode } = rule.match;
  if (!pattern) return false;
  if (mode === 'regex')
    return new RegExp(pattern, rule.type === 'response' ? '' : 'i').test(url);
  if (rule.type !== 'response')
    return urlFilterRegex(dnrUrlFilter(mode, pattern)).test(url);
  if (mode === 'wildcard')
    return new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`).test(url);
  if (mode === 'equals')
    return url === pattern || (pattern.startsWith('/') && pathOf(url) === pattern);
  return url.includes(pattern);
}

function urlFilterRegex(filter: string) {
  let source = '';
  let start = 0;
  let end = filter.length;
  if (filter.startsWith('||')) {
    source = '^[a-z][a-z0-9+.-]*://(?:[^/?#]*\\.)?';
    start = 2;
  } else if (filter.startsWith('|')) {
    source = '^';
    start = 1;
  }
  const anchoredEnd = end > start && filter.endsWith('|');
  if (anchoredEnd) end -= 1;
  for (const char of filter.slice(start, end)) {
    if (char === '*') source += '.*';
    else if (char === '^') source += '(?:[^A-Za-z0-9_\\-.%]|$)';
    else source += escapeRegex(char);
  }
  return new RegExp(anchoredEnd ? `${source}$` : source, 'i');
}

function pathOf(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function loadState(): Promise<StoredState> {
  // Whatever is stored, so every field is checked below before it's used.
  const stored = (await chrome.storage.local.get(DEFAULTS)) as StoredState;
  return {
    enabled: stored.enabled,
    record: stored.record,
    sites: normalizeSites(stored.sites),
    rules: (Array.isArray(stored.rules) ? stored.rules : []).map((rule) =>
      normalizeRule(rule),
    ),
    // local.* hosts opened so far; background.ts adds them to the DNR initiator list.
    localHosts: (Array.isArray(stored.localHosts) ? stored.localHosts : []).filter(
      (host) => typeof host === 'string' && isLocalPrefixHost(host),
    ),
  };
}
