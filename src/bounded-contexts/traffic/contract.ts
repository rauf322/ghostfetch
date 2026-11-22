// The messages Traffic sends from one part of the extension to another: a request the interceptor
// saw, to its bridge; an iframe's entry, to the background and on to its tab's top frame; the
// popup's question of what each rule did on a page, with the counts that answer it; and what a
// tab's log and the Traffic view say over the port between them. Types, and the name of that port:
// nothing else of this file ends up in the built extension. FrameEntryMessage and CountsMessage
// are its chrome.runtime and chrome.tabs messages, which the background puts in a union with
// Sites' own (src/app/background/on-message.ts). They're Traffic's published language
// (GLOSSARY-MAP.md).
import type { LogEntry } from './domain/log-entry.ts';

// The interceptor to the bridge: a request it saw. The page can forge these, so the bridge
// rebuilds the entry field by field.
export interface PageLog {
  type: 'log';
  entry: unknown;
}

// An iframe's bridge to the background, which passes it on to the tab's top frame.
export interface FrameEntryMessage {
  type: 'ghostfetch:frameEntry';
  entry: LogEntry;
}

// The popup to a tab's top-frame bridge, which answers with PageCounts.
export interface CountsMessage {
  type: 'ghostfetch:counts';
}

// A tab's bridge to the popup: how often each rule has answered on the page, by what it did, as
// the tab's traffic log has it (so while recording, since the page loaded or Traffic's Clear).
// Counts only: none of the log's URLs or bodies.
export interface PageCounts {
  record: boolean;
  rules: Record<string, RuleCount>;
}
export interface RuleCount {
  mocked: number;
  modified: number;
  failed: number;
}

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
