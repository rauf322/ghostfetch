// New rule's draft: what you typed (a path, a full URL, "GET /api/users" or a cURL command), read
// here with nothing sent anywhere, and what the pickers and starters say to answer with. The rule
// is made from both when you press Enter.
import { METHODS, createRule, graphqlOperation } from '../../../shared/api/index.ts';
import type { BodyMode, MatchMode, Method, Rule } from '../../../shared/api/index.ts';
import { parseCurl } from '../../../shared/lib/index.ts';

export interface Draft {
  method: Method;
  mode: MatchMode;
  bodyMode: BodyMode;
  // '' for 200 OK with your body, or the server's own status.
  status: string;
  delay: number;
  body: string;
  // The starter that set the answer, while nothing has changed it since.
  starter: StarterId | null;
}

// What the rule answers with, as a starter sets it: the rest of a draft is the request.
export type Answer = Pick<Draft, 'bodyMode' | 'status' | 'delay' | 'body'>;

export const EMPTY_BODY = '{\n  \n}';

// 200 OK, at once, with a body to fill in.
export const PLAIN_ANSWER: Answer = {
  bodyMode: 'replace',
  status: '',
  delay: 0,
  body: EMPTY_BODY,
};

export const NEW_DRAFT: Draft = {
  method: 'ANY',
  mode: 'contains',
  ...PLAIN_ANSWER,
  starter: null,
};

export type StarterId = 'empty' | 'fail' | 'missing' | 'slow' | 'logged-out';

// The answers people mock most, one click each. A starter sets the answer, not the request.
export const STARTERS: {
  id: StarterId;
  label: string;
  icon: 'brackets' | 'alert' | 'search' | 'timer' | 'logout';
  answer: Answer;
}[] = [
  {
    id: 'empty',
    label: 'Empty list',
    icon: 'brackets',
    answer: { bodyMode: 'replace', status: '', delay: 0, body: '[]' },
  },
  {
    id: 'fail',
    label: 'Fail with 500',
    icon: 'alert',
    answer: {
      bodyMode: 'replace',
      status: '500',
      delay: 0,
      body: '{\n  "error": "Internal Server Error"\n}',
    },
  },
  {
    id: 'missing',
    label: 'Not found',
    icon: 'search',
    answer: {
      bodyMode: 'replace',
      status: '404',
      delay: 0,
      body: '{\n  "error": "Not Found"\n}',
    },
  },
  {
    id: 'slow',
    label: 'Slow by 2 s',
    icon: 'timer',
    answer: { bodyMode: 'original', status: '', delay: 2000, body: EMPTY_BODY },
  },
  {
    id: 'logged-out',
    label: 'Logged out (401)',
    icon: 'logout',
    answer: {
      bodyMode: 'replace',
      status: '401',
      delay: 0,
      body: '{\n  "error": "Unauthorized"\n}',
    },
  },
];

export interface TypedRequest {
  // The URL pattern: a full http(s) URL's path and query, so the rule answers on any host the app
  // runs on (localhost, a local.* domain, staging); anything else as typed.
  url: string;
  // The method it named, if it named one.
  method: Method | null;
  graphqlOperation: string;
  // What a cURL command's Accept asked for, if it named one type.
  contentType: string;
}

const isMethod = (word: string): word is Method =>
  word !== 'ANY' && (METHODS as readonly string[]).includes(word);

export function readTyped(text: string): TypedRequest {
  const typed = text.trim();
  const curl = /^curl\s/i.test(typed) ? parseCurl(typed) : null;
  if (curl) {
    const accept = curl.headers.find(([name]) => name === 'accept')?.[1] ?? '';
    const type = accept.split(',')[0]!.split(';')[0]!.trim();
    return {
      url: pattern(curl.url),
      method: isMethod(curl.method) ? curl.method : null,
      graphqlOperation: graphqlOperation(curl.body),
      contentType: type && !type.includes('*') ? type : '',
    };
  }
  const [, verb = '', rest = ''] = /^([A-Za-z]+)\s+(\S[\s\S]*)$/.exec(typed) ?? [];
  if (isMethod(verb.toUpperCase()))
    return {
      url: pattern(rest.trim()),
      method: verb.toUpperCase() as Method,
      graphqlOperation: '',
      contentType: '',
    };
  return { url: pattern(typed), method: null, graphqlOperation: '', contentType: '' };
}

function pattern(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      return parsed.pathname + parsed.search;
  } catch {
    // Not a full URL: a path or a part of one, kept as typed.
  }
  return url;
}

export function ruleFromDraft(text: string, draft: Draft): Rule {
  const typed = readTyped(text);
  const rule = createRule();
  rule.match = {
    url: typed.url,
    mode: draft.mode,
    method: draft.method,
    graphqlOperation: typed.graphqlOperation,
  };
  rule.response.bodyMode = draft.bodyMode;
  rule.response.status = draft.status;
  rule.response.delay = draft.delay;
  rule.response.body = draft.body;
  if (typed.contentType) rule.response.contentType = typed.contentType;
  return rule;
}
