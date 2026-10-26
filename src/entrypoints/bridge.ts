// Isolated-world half of the content script. Reads rules from extension storage and hands
// the response rules to interceptor.ts (the page-world half) over a private MessageChannel,
// whose port is offered exactly once, before any page script runs. The top frame also keeps
// the tab's traffic log, so the editor can show requests made before it was opened.
// Built as bridge.js: WXT's wrapper runs this function at once and adds no globals of its own.
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import type {
  LogEntry,
  LogPortMessage,
  LogViewerMessage,
  PageState,
  RuntimeMessage,
} from '../lib/messages.ts';
import type { Untrusted } from '../lib/store.ts';

export default defineUnlistedScript(() => {
  // Same two guards as interceptor.ts. The flag lives in the extension's isolated world, which
  // all its content scripts share and the page can't see.
  const address = new URL(document.URL);
  if (address.username || address.password) return;
  if ((globalThis as { mocktailBridge?: boolean }).mocktailBridge) return;
  (globalThis as { mocktailBridge?: boolean }).mocktailBridge = true;

  const MAX_LOG = 300;
  const KINDS = new Set<unknown>([
    'fetch',
    'xhr',
    'main_frame',
    'sub_frame',
    'stylesheet',
    'script',
    'image',
    'font',
    'object',
    'xmlhttprequest',
    'ping',
    'csp_report',
    'media',
    'websocket',
    'other',
  ]);
  const ACTIONS = new Set<unknown>([
    '',
    'mocked',
    'modified',
    'error',
    'redirect',
    'headers',
    'block',
  ]);
  const isTop = window === window.top;
  const log: LogEntry[] = [];
  const viewers = new Set<chrome.runtime.Port>();
  let recording = true;
  let sequence = 0;

  const channel = new MessageChannel();
  const port = channel.port1;
  port.onmessage = ({ data }) => {
    if (data?.type === 'log') record(data.entry);
  };
  window.postMessage({ mocktail: 'port' }, '*', [channel.port2]);
  sendState();

  async function sendState() {
    try {
      const { enabled, record, rules } = (await chrome.storage.local.get({
        enabled: true,
        record: true,
        rules: [],
      })) as { enabled: boolean; record: boolean; rules: unknown };
      recording = record;
      port.postMessage({
        type: 'state',
        enabled,
        record,
        rules: Array.isArray(rules)
          ? rules.filter((rule) => rule?.type === 'response' && rule.enabled)
          : [],
      } satisfies PageState);
    } catch {
      // The extension was reloaded or removed; this copy of the script is orphaned.
    }
  }

  // Entries come from the page's own world (or from another frame's), which the page controls.
  // Rebuild each one from known fields and types so nothing unexpected reaches the editor.
  function clean(raw: Untrusted): LogEntry | null {
    if (!raw || typeof raw !== 'object') return null;
    const text = (value: unknown, max: number) =>
      typeof value === 'string' ? value.slice(0, max) : '';
    const method = text(raw.method, 32).toUpperCase();
    return {
      id: `${Date.now().toString(36)}-${(sequence++).toString(36)}`,
      time: Number.isFinite(raw.time) ? raw.time : Date.now(),
      kind: KINDS.has(raw.kind) ? raw.kind : 'other',
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
        .sendMessage({ type: 'mocktail:frameEntry', entry } satisfies RuntimeMessage)
        .catch(() => {});
      return;
    }
    log.push(entry);
    if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
    for (const viewer of viewers)
      viewer.postMessage({ type: 'entry', entry } satisfies LogPortMessage);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.rules || changes.enabled || changes.record))
      sendState();
  });

  if (!isTop) return;

  chrome.runtime.onMessage.addListener((message: RuntimeMessage | undefined) => {
    if (message?.type === 'mocktail:dnrHit' || message?.type === 'mocktail:frameEntry')
      record(message.entry);
  });

  // The editor's Traffic view connects here to get the log so far plus live updates.
  chrome.runtime.onConnect.addListener((viewer) => {
    if (viewer.name !== 'mocktail-log') return;
    viewers.add(viewer);
    viewer.onDisconnect.addListener(() => viewers.delete(viewer));
    viewer.onMessage.addListener((message: LogViewerMessage | undefined) => {
      if (message?.type === 'clear') log.length = 0;
    });
    viewer.postMessage({
      type: 'snapshot',
      entries: log,
      url: location.href,
    } satisfies LogPortMessage);
  });
});
