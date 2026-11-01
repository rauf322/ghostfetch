// Isolated-world half of the content script. Reads rules from extension storage and hands
// the ones that are on to the interceptor (the page-world half) over a private MessageChannel,
// whose port is offered exactly once, before any page script runs. The top frame also keeps
// the tab's traffic log, so the editor can show requests made before it was opened.
// Built as bridge.js: WXT's wrapper runs this function at once and adds no globals of its own.
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { isResponseRule } from '../../shared/api/index.ts';
import type {
  LogEntry,
  LogPortMessage,
  LogViewerMessage,
  PageState,
  RuntimeMessage,
} from '../../shared/api/index.ts';
import type { Untrusted } from '../../shared/lib/index.ts';

export default defineUnlistedScript(() => {
  // Same two guards as the interceptor. The flag lives in the extension's isolated world, which
  // all its content scripts share and the page can't see.
  const address = new URL(document.URL);
  if (address.username || address.password) return;
  if ((globalThis as { ghostfetchBridge?: boolean }).ghostfetchBridge) return;
  (globalThis as { ghostfetchBridge?: boolean }).ghostfetchBridge = true;

  const MAX_LOG = 300;
  const KINDS = new Set<unknown>(['fetch', 'xhr']);
  const ACTIONS = new Set<unknown>(['', 'mocked', 'modified', 'error']);
  const isTop = window === window.top;
  const log: LogEntry[] = [];
  const viewers = new Set<chrome.runtime.Port>();
  // To one Traffic view. A chrome.runtime.Port takes no target origin, unlike window.postMessage().
  const send = (viewer: chrome.runtime.Port, message: LogPortMessage) =>
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    viewer.postMessage(message);
  let recording = true;
  let sequence = 0;

  const channel = new MessageChannel();
  const port = channel.port1;
  port.addEventListener('message', ({ data }) => {
    if (data?.type === 'log') record(data.entry);
  });
  // Setting onmessage starts a port; with addEventListener, start() does.
  port.start();
  window.postMessage({ ghostfetch: 'port' }, '*', [channel.port2]);
  sendState();

  async function sendState() {
    try {
      const stored = (await chrome.storage.local.get({
        enabled: true,
        record: true,
        rules: [],
      })) as { enabled: boolean; record: boolean; rules: unknown };
      recording = stored.record;
      port.postMessage({
        type: 'state',
        enabled: stored.enabled,
        record: stored.record,
        // As they're stored, which can still include a redirect, header or block rule from
        // before 0.9.0 until the rules are next saved.
        rules: Array.isArray(stored.rules)
          ? stored.rules.filter((rule) => isResponseRule(rule) && rule?.enabled)
          : [],
      } satisfies PageState);
    } catch {
      // The extension was reloaded or removed; this copy of the script is orphaned.
    }
  }

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
        .sendMessage({ type: 'ghostfetch:frameEntry', entry } satisfies RuntimeMessage)
        .catch(() => {});
      return;
    }
    log.push(entry);
    if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
    for (const viewer of viewers) send(viewer, { type: 'entry', entry });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.rules || changes.enabled || changes.record))
      sendState();
  });

  if (!isTop) return;

  // A request an iframe logged, which the background passes on.
  chrome.runtime.onMessage.addListener((message: RuntimeMessage | undefined) => {
    if (message?.type === 'ghostfetch:frameEntry') record(message.entry);
  });

  // The editor's Traffic view connects here to get the log so far plus live updates.
  chrome.runtime.onConnect.addListener((viewer) => {
    if (viewer.name !== 'ghostfetch-log') return;
    viewers.add(viewer);
    viewer.onDisconnect.addListener(() => viewers.delete(viewer));
    viewer.onMessage.addListener((message: LogViewerMessage | undefined) => {
      if (message?.type === 'clear') log.length = 0;
    });
    send(viewer, { type: 'snapshot', entries: log, url: location.href });
  });
});
