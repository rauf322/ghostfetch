// What a rule's match and its answer are made of, which Rules and Interception must mean the same
// thing by: the methods a rule can match, the ways of comparing a URL, the body modes and a header
// row, and the two halves of a rule themselves, what it matches (RuleMatch) and what it answers
// with (RuleResponse). A rule is built from them in bounded-contexts/rules/domain/types.ts. Types
// only: nothing of this file ends up in the built extension.

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

// The two halves of a rule: what it matches (Rule['match']) and what it answers with
// (Rule['response']). Types and not interfaces, so that Rule, built from them, is exactly what it
// was with them written out inside it: an interface, for one, doesn't pass for a Record.
export type RuleMatch = {
  url: string;
  mode: MatchMode;
  method: Method;
  graphqlOperation: string;
};

export type RuleResponse = {
  bodyMode: BodyMode;
  body: string;
  // '' (keep the server's status, or 200 for Replace) or up to three digits.
  status: string;
  delay: number;
  contentType: string;
  headers: HeaderRow[];
};
