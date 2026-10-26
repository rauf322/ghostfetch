// The messages Ghostfetch's parts send each other, and the traffic log's entries. Types only:
// nothing in this file ends up in the built extension.
import type { Rule, RuleType } from './store.ts';

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
// (see clean() in entrypoints/bridge.ts).
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

// The bridge to the interceptor, over their private MessageChannel: the response rules.
export interface PageState {
  type: 'state';
  enabled: boolean;
  record: boolean;
  rules: Rule[];
}

// The interceptor to the bridge: a request it saw. The page can forge these, so the bridge
// rebuilds the entry field by field.
export interface PageLog {
  type: 'log';
  entry: unknown;
}

// chrome.runtime and chrome.tabs messages.
export type RuntimeMessage =
  // The popup or editor to the background: re-register the content scripts and rules now.
  | { type: 'mocktail:sync' }
  // An iframe's bridge to the background, which passes it on to the tab's top frame.
  | { type: 'mocktail:frameEntry'; entry: LogEntry }
  // The background to a tab's top frame: a redirect, header or block rule fired.
  | { type: 'mocktail:dnrHit'; entry: Partial<LogEntry> };

// Over the "mocktail-log" port: a tab's top-frame bridge to the Traffic view, and back.
export type LogPortMessage =
  | { type: 'snapshot'; entries: LogEntry[]; url: string }
  | { type: 'entry'; entry: LogEntry };
export interface LogViewerMessage {
  type: 'clear';
}
