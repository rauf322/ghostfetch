// Making rules: a new one, one rebuilt from data that can't be trusted, and the name a rule goes by.
import type { Untrusted } from '../../lib/index.ts';
import { BODY_MODES, MATCH_MODES, METHODS, TYPES } from './catalog.ts';
import type { BodyMode, HeaderRow, Method, Rule, RuleType } from './types.ts';

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

// Whether `key` names one of `options` (TYPES, MATCH_MODES, BODY_MODES), checked like Object.hasOwn.
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
      bodyMode: bodyMode(response.bodyMode),
      body: text(response.body, base.response.body),
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

export function ruleTitle(rule: Rule) {
  return (
    rule.name.trim() || rule.match.graphqlOperation || rule.match.url || 'Untitled rule'
  );
}
