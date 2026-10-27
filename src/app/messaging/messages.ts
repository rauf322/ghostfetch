// The messages the extension's own parts send each other: the background, the bridge in each page
// and the interceptor in its page world. (The Traffic view's port to a tab is entities/traffic's.)
// Types only: nothing in this file ends up in the built extension.
import type { Rule } from '../../entities/rule/index.ts';
import type { LogEntry } from '../../entities/traffic/index.ts';

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
  | { type: 'ghostfetch:sync' }
  // An iframe's bridge to the background, which passes it on to the tab's top frame.
  | { type: 'ghostfetch:frameEntry'; entry: LogEntry }
  // The background to a tab's top frame: a redirect, header or block rule fired.
  | { type: 'ghostfetch:dnrHit'; entry: Partial<LogEntry> };
