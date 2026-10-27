// The requests a tab makes, as its traffic log records them, and the port the Traffic view reads
// that log through.
export type { EntryAction, EntryKind, LogEntry } from './model/entry.ts';
export { LOG_PORT } from './api/log-port.ts';
export type { LogPortMessage, LogViewerMessage } from './api/log-port.ts';
