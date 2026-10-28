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
