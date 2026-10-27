// The "ghostfetch-log" port: the Traffic view connects to a tab's top-frame bridge over it, gets the
// log so far, then each request as it happens, and can ask the tab to clear its log.
import type { LogEntry } from '../model/entry.ts';

export const LOG_PORT = 'ghostfetch-log';

// The tab's bridge to the Traffic view.
export type LogPortMessage =
  | { type: 'snapshot'; entries: LogEntry[]; url: string }
  | { type: 'entry'; entry: LogEntry };
// The Traffic view to the tab's bridge.
export interface LogViewerMessage {
  type: 'clear';
}
