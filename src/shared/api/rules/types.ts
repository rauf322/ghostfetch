// A rule as it's stored, edited and sent to the page. Every rule answers the page's fetch() and
// XMLHttpRequest calls that it matches. Up to 0.8 a rule also had a type: redirect, header and
// block rules, which 0.9.0 took out, are left out when the rules are read (normalizeRules).

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
// Replace sends `body` without calling the server; original (Server's body) calls the server and
// keeps its body. Merge and Script, which went in 0.8.0, are read as original (normalizeRule).
export type BodyMode = 'replace' | 'original';

export interface HeaderRow {
  op: 'set' | 'remove';
  name: string;
  value: string;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  // The group the rule is in, by its id, or '' for none (an ungrouped rule).
  group: string;
  match: { url: string; mode: MatchMode; method: Method; graphqlOperation: string };
  response: {
    bodyMode: BodyMode;
    body: string;
    // '' (keep the server's status, or 200 for Replace) or up to three digits.
    status: string;
    delay: number;
    contentType: string;
    headers: HeaderRow[];
  };
  createdAt: number;
  updatedAt: number;
}

// A group of rules (docs/glossary/rules.md): a name no other group has, and a switch of its own.
// Its rules stand together in the order, in its place, and answer only while it's on as well as
// they; turned off, it leaves their own switches as they were. One level only: a group holds
// rules, never another group. Where it stands in the order is kept with the rules
// (order-storage.ts).
export interface Group {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
