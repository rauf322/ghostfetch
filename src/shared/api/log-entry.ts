// One request in a tab's traffic log. Types only: nothing in this file ends up in the built
// extension.

// What a logged request was: a fetch() or an XMLHttpRequest in the page.
export type EntryKind = 'fetch' | 'xhr';

// What a rule did to the request: answered it with its own body (mocked), changed the server's
// response (modified), or couldn't get the server's response (error); '' when no rule matched.
export type EntryAction = '' | 'mocked' | 'modified' | 'error';

// One request in a tab's traffic log, as the bridge rebuilds it from what the page reported
// (see clean() in app/bridge).
export interface LogEntry {
  id: string;
  time: number;
  kind: EntryKind;
  method: string;
  url: string;
  // The iframe's origin, or '' for the top frame.
  frame: string;
  requestBody: string;
  duration: number | null;
  status: number | null;
  contentType: string;
  responseBody: string;
  truncated: boolean;
  ruleId: string | null;
  ruleName: string;
  action: EntryAction;
  error: string;
}
