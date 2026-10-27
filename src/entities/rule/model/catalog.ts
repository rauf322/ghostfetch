// The rule types, methods, URL match modes and body modes, with the words the screens show for
// them, and the script a new Script body starts with.
import type { BodyMode, MatchMode, Method, RuleType } from './types.ts';

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
