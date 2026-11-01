// The rule types, methods, URL match modes and body modes, with the words the screens show for
// them.
import type { BodyMode, MatchMode, Method, RuleType } from './types.ts';

export const TYPES: Record<RuleType, { label: string; short: string; desc: string }> = {
  response: {
    label: 'Modify response',
    short: 'Response',
    desc: "Replace the body, or keep the server's and change its status, headers or delay",
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

export const BODY_MODES: Record<BodyMode, { label: string; desc: string }> = {
  replace: { label: 'Replace', desc: 'Return this body without calling the server.' },
  original: {
    label: "Server's body",
    desc: 'Call the server and keep its body. Change its status, headers or delay in the other tabs.',
  },
};
