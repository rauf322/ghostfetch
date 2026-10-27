// One request in a tab's traffic log. Types only: nothing in this file ends up in the built
// extension.
import type { RuleType } from '../../rule/@x/traffic.ts';

// What a logged request was: fetch() or XMLHttpRequest in the page, or the resource type
// declarativeNetRequest reports for a redirect, header or block rule hit.
export type EntryKind =
  | 'fetch'
  | 'xhr'
  | 'main_frame'
  | 'sub_frame'
  | 'stylesheet'
  | 'script'
  | 'image'
  | 'font'
  | 'object'
  | 'xmlhttprequest'
  | 'ping'
  | 'csp_report'
  | 'media'
  | 'websocket'
  | 'other';

// What a rule did to the request; '' when no rule matched.
export type EntryAction =
  | ''
  | 'mocked'
  | 'modified'
  | 'error'
  | Exclude<RuleType, 'response'>;

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
