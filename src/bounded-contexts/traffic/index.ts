// Traffic: what the page asked for, and what each rule did (its words are in
// docs/glossary/traffic.md). A request in a tab's traffic log (domain/log-entry.ts); the editor's
// live copy of the log of the page it watches, with its Keep on reload setting, the screens' copy
// of Recording, whether requests are added to the logs at all, and what each rule did on a page,
// counted and in words, and when it last did (application/); the tab's own log, which the bridge
// starts in each page (infrastructure/tab-log.ts); and the messages between them (contract.ts).
// One of the two ways into this folder, the other being ui/index.ts, which has the Traffic view
// and the hooks; Traffic's own ui/ takes what's offered here from here as well. This one is plain
// TypeScript with no npm package and no React; of Ghostfetch's own code it may import only lib,
// platform and sites, and its domain/ only lib. The background, the bridge and the interceptor
// import from here too, and keep only what they use.
export type { EntryAction, EntryKind, LogEntry } from './domain/log-entry.ts';
export { createTrafficLog } from './application/traffic-log.ts';
export type {
  TrafficLog,
  TrafficSnapshot,
  TrafficTab,
} from './application/traffic-log.ts';
export { isPreserved, rememberPreserve } from './application/preserve.ts';
export { initRecording, recordingStore, setRecording } from './application/recording.ts';
export {
  askPageCounts,
  countRule,
  countWords,
  lastAnswered,
} from './application/page-counts.ts';
export { createTabLog } from './infrastructure/tab-log.ts';
export { LOG_PORT } from './contract.ts';
export type {
  CountsMessage,
  FrameEntryMessage,
  LogPortMessage,
  LogViewerMessage,
  PageCounts,
  PageLog,
  RuleCount,
} from './contract.ts';
