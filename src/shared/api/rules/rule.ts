// Making rules: a new one, one rebuilt from data that can't be trusted, and the name a rule goes by.
import type { Untrusted } from '../../lib/index.ts';
import { BODY_MODES, MATCH_MODES, MAX_DELAY, METHODS } from './catalog.ts';
import type { BodyMode, HeaderRow, Method, Rule } from './types.ts';

export function createRule(): Rule {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: '',
    enabled: true,
    match: { url: '', mode: 'contains', method: 'ANY', graphqlOperation: '' },
    response: {
      bodyMode: 'replace',
      body: '{\n  \n}',
      status: '',
      delay: 0,
      contentType: 'application/json',
      headers: [],
    },
    createdAt: now,
    updatedAt: now,
  };
}

// Whether stored or imported data is a rule Ghostfetch still has: one with no type (from 0.9.0 on)
// or a response rule. Redirect, header and block rules, which 0.9.0 took out, aren't. The bridge
// asks this of the rules as they're stored, before handing them to the page.
export function isResponseRule(input: unknown) {
  const type = (input as Untrusted)?.type;
  return type === undefined || type === 'response';
}

// The rules in a stored or imported list that Ghostfetch still has (isResponseRule), each rebuilt
// by normalizeRule. A redirect, header or block rule is left out, so the next save drops it.
export function normalizeRules(list: unknown, options: { newId?: boolean } = {}): Rule[] {
  return (Array.isArray(list) ? list : [])
    .filter(isResponseRule)
    .map((rule) => normalizeRule(rule, options));
}

// Whether `key` names one of `options` (MATCH_MODES, BODY_MODES), checked like Object.hasOwn.
function isKey<T extends object>(options: T, key: unknown): key is keyof T {
  return Object.hasOwn(options, key as PropertyKey);
}

const isMethod = (value: unknown): value is Method =>
  (METHODS as readonly unknown[]).includes(value);

// A stored body mode. Merge and Script, which 0.8.0 took out, called the server too, so a rule
// saved with one keeps the server's body, as the page already gets it (apply-rule.ts), rather
// than falling back to Replace and sending a body the rule never had.
function bodyMode(mode: unknown): BodyMode {
  if (isKey(BODY_MODES, mode)) return mode;
  return mode === 'merge' || mode === 'script' ? 'original' : 'replace';
}

// Rebuilds a rule field by field from known keys and types, so stored, older or imported
// rules (which may come from an untrusted file) can't carry unexpected values into the UI.
export function normalizeRule(input: unknown, { newId = false } = {}): Rule {
  const raw = input as Untrusted;
  const base = createRule();
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
    match: {
      url: text(match.url),
      mode: isKey(MATCH_MODES, match.mode) ? match.mode : 'contains',
      method: isMethod(match.method) ? match.method : 'ANY',
      graphqlOperation: text(match.graphqlOperation),
    },
    response: {
      bodyMode: bodyMode(response.bodyMode),
      body: text(response.body, base.response.body),
      status: /^\d{0,3}$/.test(status) ? status : '',
      delay: Math.min(Math.max(Math.round(Number(response.delay) || 0), 0), MAX_DELAY),
      contentType: text(response.contentType, base.response.contentType),
      headers: headerRows(response.headers),
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

export function ruleTitle(rule: Rule) {
  return (
    rule.name.trim() || rule.match.graphqlOperation || rule.match.url || 'Untitled rule'
  );
}
