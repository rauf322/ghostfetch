// The methods, URL match modes and body modes, with the words the screens show for them.
import type { BodyMode, MatchMode, Method } from './types.ts';

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
  equals: 'The full URL, or just its path, e.g. /api/users?page=1',
  wildcard: '* matches anything, e.g. https://api.example.com/users/*',
  regex: 'Regular expression tested against the full URL, e.g. /api/users/\\d+$',
};

export const BODY_MODES: Record<BodyMode, { label: string; desc: string }> = {
  replace: { label: 'Replace', desc: 'Return this body without calling the server.' },
  original: {
    label: "Server's body",
    desc: 'Call the server and keep its body. The status, headers and delay you set still apply.',
  },
};
