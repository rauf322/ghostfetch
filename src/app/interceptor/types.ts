// What the interceptor's parts pass each other: a request as the rules see it, what a matched rule
// gives the page, the rules as the bridge sent them, and what it keeps on an XMLHttpRequest.
import type { EntryAction, Rule } from '../../shared/api/index.ts';

// A request as the rules see it.
export interface PageRequest {
  url: string;
  method: string;
  body: string;
}

// What a matched rule gives the page, and what it did: mocked it (Replace) or changed the real
// response (Server's body).
export interface RuleResult {
  status: number;
  statusText: string;
  headers: Headers;
  // Replace: the rule's own body, or null with a status that has none. Server's body: null, as
  // the body is the server's (`server`).
  body: string | null;
  // Server's body: the server's response, its body not read yet, so each caller takes it its
  // own way: fetch as it arrives, an XMLHttpRequest whole. null for Replace.
  server: Response | null;
  // Whether the rule set a status or a header. One that sets neither over the server's response
  // (a rule that only delays) leaves that response as it is.
  changed: boolean;
  action: Extract<EntryAction, 'mocked' | 'modified'>;
}

// A response rule, with its URL pattern made into a test.
export interface Compiled {
  rule: Rule;
  test: (url: string) => boolean;
}

// The response rules as the bridge last sent them, compiled, and the two switches. `needsBody`:
// a Request's body is worth reading, for the log or for a rule that matches a GraphQL operation.
export interface PageRules {
  enabled: boolean;
  record: boolean;
  rules: Compiled[];
  needsBody: boolean;
}

// What this script keeps on each XMLHttpRequest, under a private symbol.
export interface XhrMeta {
  method: string;
  url: string;
  async: boolean;
  headers: [string, string][];
  simulated?: boolean;
  aborted?: boolean;
  finished?: boolean;
  abortSimulation?: () => void;
}
export type XhrBody = Document | XMLHttpRequestBodyInit | null | undefined;
