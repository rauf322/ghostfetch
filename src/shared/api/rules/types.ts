// A rule as it's stored, edited and sent to the page.

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
  type: RuleType;
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
  redirect: { to: string };
  headers: { request: HeaderRow[]; response: HeaderRow[] };
  createdAt: number;
  updatedAt: number;
}
