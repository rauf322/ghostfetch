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

// Each way of comparing a URL: its name on the chip that picks it, the hint under the pattern,
// the name of the rule's URL row ("URL contains"), and how the rule's sentence says it
// ("Answers requests whose URL contains /api/user").
export const MATCH_MODES: Record<
  MatchMode,
  { label: string; hint: string; row: string; said: string }
> = {
  contains: {
    label: 'Contains',
    hint: 'Matches when the full URL contains this text, e.g. /api/users',
    row: 'URL contains',
    said: 'whose URL contains',
  },
  equals: {
    label: 'Equals',
    hint: 'The full URL, or just its path, e.g. /api/users?page=1',
    row: 'URL equals',
    said: 'to',
  },
  wildcard: {
    label: 'Wildcard',
    hint: '* matches anything, e.g. https://api.example.com/users/*',
    row: 'URL matches',
    said: 'whose URL matches',
  },
  regex: {
    label: 'Regex',
    hint: 'Regular expression tested against the full URL, e.g. /api/users/\\d+$',
    row: 'URL matches regex',
    said: 'whose URL matches the regex',
  },
};

// Each body mode: its name in the rule list's summary, the words on the body card's option, and
// what it does.
export const BODY_MODES: Record<
  BodyMode,
  { label: string; option: string; desc: string }
> = {
  replace: {
    label: 'Replace',
    option: 'Replace body',
    desc: 'Return this body without calling the server.',
  },
  original: {
    label: "Server's body",
    option: "Keep server's body",
    desc: 'Call the server and keep its body. The status, headers and delay you set still apply.',
  },
};
