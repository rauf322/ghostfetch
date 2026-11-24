// A tab's traffic log, as the page keeps it: the bridge (src/app/bridge/) starts one in each frame
// and gives it what the page reports. Each report is rebuilt before it's kept, as the page can
// forge one: clean() is Traffic's anticorruption layer against Interception (GLOSSARY-MAP.md).
// The top frame's log is the tab's: an iframe's entries reach it through the background, the
// popup asks it how often each rule answered, and the editor's Traffic view reads it over the
// "ghostfetch-log" port, so the editor can show requests made before it was opened. It lives with
// the page and is never stored. Its messages are in ../contract.ts.
import type { Untrusted } from '../../../lib/index.ts';
import type {
  CountsMessage,
  FrameEntryMessage,
  LogPortMessage,
  LogViewerMessage,
  PageCounts,
  RuleCount,
} from '../contract.ts';
import type { LogEntry } from '../domain/log-entry.ts';

// Called once as the bridge starts, before it offers the interceptor its port. `isTop`: whether
// this frame is the tab's top one, whose log is the tab's. It gives back what the bridge needs:
// record(), for a request the page reported; setRecording(), for whether requests are recorded,
// as the bridge reads it from storage; and listen(), which the top frame's bridge calls last.
export function createTabLog({ isTop }: { isTop: boolean }) {
  const MAX_LOG = 300;
  // Chrome passes a message of at most 64 MiB, as JSON, and each request in the log can hold a
  // 1 MB body: the log so far goes to a Traffic view in parts of at most this many characters of
  // URLs and bodies, which as JSON stay under that even if every character took six bytes
  // (\u0001), with room for the rest of each entry.
  const PART = 8_000_000;
  const KINDS = new Set<unknown>(['fetch', 'xhr']);
  const ACTIONS = new Set<unknown>(['', 'mocked', 'modified', 'error']);
  const log: LogEntry[] = [];
  const viewers = new Set<chrome.runtime.Port>();
  // To one Traffic view. A chrome.runtime.Port takes no target origin, unlike window.postMessage().
  const send = (viewer: chrome.runtime.Port, message: LogPortMessage) =>
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    viewer.postMessage(message);
  let recording = true;
  let sequence = 0;

  // Entries come from the page's own world (or from another frame's), which the page controls.
  // Rebuild each one from known fields and types so nothing unexpected reaches the editor.
  function clean(raw: Untrusted): LogEntry | null {
    // The interceptor only ever reports a fetch() or an XMLHttpRequest.
    if (!raw || typeof raw !== 'object' || !KINDS.has(raw.kind)) return null;
    const text = (value: unknown, max: number) =>
      typeof value === 'string' ? value.slice(0, max) : '';
    const method = text(raw.method, 32).toUpperCase();
    return {
      id: `${Date.now().toString(36)}-${(sequence++).toString(36)}`,
      time: Number.isFinite(raw.time) ? raw.time : Date.now(),
      kind: raw.kind,
      method: /^[A-Z][A-Z0-9_-]*$/.test(method) ? method : 'INVALID',
      url: text(raw.url, 8192),
      frame: text(raw.frame, 512),
      requestBody: text(raw.requestBody, 100_000),
      duration: Number.isFinite(raw.duration)
        ? Math.max(0, Math.round(raw.duration))
        : null,
      status:
        Number.isInteger(raw.status) && raw.status > 0 && raw.status < 1000
          ? raw.status
          : null,
      contentType: text(raw.contentType, 256),
      responseBody: text(raw.responseBody, 1_000_000),
      truncated: raw.truncated === true,
      ruleId: text(raw.ruleId, 64) || null,
      ruleName: text(raw.ruleName, 300),
      groupName: text(raw.groupName, 300),
      action: ACTIONS.has(raw.action) ? raw.action : '',
      error: text(raw.error, 1000),
    };
  }

  function record(raw: Untrusted) {
    const entry = recording ? clean(raw) : null;
    if (!entry) return;
    if (!isTop) {
      // Frames can't reach the top frame's log directly, so the service worker relays.
      chrome.runtime
        .sendMessage({ type: 'ghostfetch:frameEntry', entry } satisfies FrameEntryMessage)
        .catch(() => {});
      return;
    }
    log.push(entry);
    if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
    for (const viewer of viewers) send(viewer, { type: 'entry', entry });
  }

  // The log so far in parts of up to PART characters, oldest first, each with one entry at least.
  function inParts(entries: LogEntry[]) {
    const parts: LogEntry[][] = [[]];
    let size = 0;
    for (const entry of entries) {
      const length =
        entry.url.length + entry.requestBody.length + entry.responseBody.length;
      if (size + length > PART && parts.at(-1)!.length) {
        parts.push([]);
        size = 0;
      }
      parts.at(-1)!.push(entry);
      size += length;
    }
    return parts;
  }

  // What only the top frame does, once its bridge has offered the port and listens to storage:
  // it hears an iframe's entries and the popup's question, and the Traffic view's connection.
  function listen() {
    // A request an iframe logged, which the background passes on; and the popup, asking how often
    // each rule has answered here. Only the extension's own parts can send these.
    chrome.runtime.onMessage.addListener(
      (
        message: FrameEntryMessage | CountsMessage | undefined,
        _sender: chrome.runtime.MessageSender,
        respond: (counts: PageCounts) => void,
      ) => {
        if (message?.type === 'ghostfetch:frameEntry') record(message.entry);
        if (message?.type === 'ghostfetch:counts') respond(counts());
      },
    );

    // The log, counted by rule and by what the rule did. A request the page gave up on before its
    // rule answered (action '') is none of them, as in the rule editor's count.
    function counts(): PageCounts {
      const rules: Record<string, RuleCount> = {};
      for (const { ruleId, action } of log) {
        if (!ruleId || !action) continue;
        const count = (rules[ruleId] ??= { mocked: 0, modified: 0, failed: 0 });
        count[action === 'error' ? 'failed' : action] += 1;
      }
      return { record: recording, rules };
    }

    // The editor's Traffic view connects here to get the log so far plus live updates.
    chrome.runtime.onConnect.addListener((viewer) => {
      if (viewer.name !== 'ghostfetch-log') return;
      viewers.add(viewer);
      viewer.onDisconnect.addListener(() => viewers.delete(viewer));
      viewer.onMessage.addListener((message: LogViewerMessage | undefined) => {
        if (message?.type === 'clear') log.length = 0;
      });
      const [first, ...rest] = inParts(log);
      send(viewer, { type: 'snapshot', entries: first!, url: location.href });
      for (const entries of rest) send(viewer, { type: 'more', entries });
    });
  }

  return {
    record,
    setRecording(on: boolean) {
      recording = on;
    },
    listen,
  };
}
