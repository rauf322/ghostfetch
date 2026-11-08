// The messages the extension's own parts send each other: the background, the bridge in each page,
// the interceptor in its page world, and the Traffic view, which reads a tab's log over a port.
// Types, and the name of that port: nothing else of this file ends up in the built extension.
import type { LogEntry } from './log-entry.ts';
import type { Rule } from './rules/types.ts';

// The bridge to the interceptor, over their private MessageChannel: the rules that are on.
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
  // The popup or editor to the background: re-register the content scripts now.
  | { type: 'ghostfetch:sync' }
  // An iframe's bridge to the background, which passes it on to the tab's top frame.
  | { type: 'ghostfetch:frameEntry'; entry: LogEntry };

// The "ghostfetch-log" port: the Traffic view connects to a tab's top-frame bridge over it, gets the
// log so far, then each request as it happens, and can ask the tab to clear its log.
export const LOG_PORT = 'ghostfetch-log';

// The tab's bridge to the Traffic view: the log so far (a long one in parts: the snapshot, then
// the rest of it in order as "more", since Chrome passes a message of at most 64 MiB), then each
// request as it happens.
export type LogPortMessage =
  | { type: 'snapshot'; entries: LogEntry[]; url: string }
  | { type: 'more'; entries: LogEntry[] }
  | { type: 'entry'; entry: LogEntry };
// The Traffic view to the tab's bridge.
export interface LogViewerMessage {
  type: 'clear';
}
