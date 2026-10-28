// The Traffic view's live log: picks the tab to watch, connects to the "ghostfetch-log" port of
// that tab's bridge (src/app/bridge/) and keeps the requests it reports. No DOM: the
// view draws snapshot() and draws again when subscribe() says it changed, at most once a frame,
// however many requests arrive.
import type {
  LogEntry,
  LogPortMessage,
  LogViewerMessage,
} from '../../../shared/api/index.ts';

const MAX_ENTRIES = 500;

const isWebUrl = (url: string | undefined) => /^https?:/.test(url || '');

export interface TrafficTab {
  id: number;
  title: string;
  url: string;
}

export interface TrafficSnapshot {
  // Oldest first.
  entries: LogEntry[];
  // Every web page open, for the page picker.
  tabs: TrafficTab[];
  targetId: number | null;
  targetUrl: string;
  // The page's log has arrived, so new requests show as they happen.
  connected: boolean;
  // Connecting, or about to try again (a page that's loading drops the connection), so it's too
  // soon to say Ghostfetch isn't running there.
  connecting: boolean;
}

interface TrafficLogOptions {
  // The side panel follows the active tab; the editor in a tab keeps the tab it picked.
  followActiveTab: boolean;
  // Whether the requests from before a page load stay when it reloads (Preserve).
  preserve: () => boolean;
}

// What createTrafficLog() returns, for the components that use it.
export type TrafficLog = ReturnType<typeof createTrafficLog>;

export function createTrafficLog({ followActiveTab, preserve }: TrafficLogOptions) {
  let entries = new Map<string, LogEntry>();
  let tabs: TrafficTab[] = [];
  let targetId: number | null = null;
  let targetUrl = '';
  let port: chrome.runtime.Port | null = null;
  let connected = false;
  let windowId: number | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let tabsTimer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let frame = 0;
  const listeners = new Set<() => void>();
  let current = snapshot();

  function snapshot(): TrafficSnapshot {
    return {
      entries: [...entries.values()],
      tabs,
      targetId,
      targetUrl,
      connected,
      connecting: Boolean(port) || retryTimer !== undefined,
    };
  }

  function changed() {
    if (frame || !running) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      current = snapshot();
      for (const listener of listeners) listener();
    });
  }

  // ------------------------------------------------------------ connection

  function connect(attempt = 0) {
    clearTimeout(retryTimer);
    retryTimer = undefined;
    port?.disconnect();
    port = null;
    connected = false;
    changed();
    if (targetId == null || !running) return;

    const opened = chrome.tabs.connect(targetId, { name: 'ghostfetch-log', frameId: 0 });
    port = opened;
    opened.onMessage.addListener((message: LogPortMessage) => {
      if (opened !== port) return;
      if (message.type === 'snapshot') {
        connected = true;
        if (!preserve()) entries = new Map();
        for (const entry of message.entries) entries.set(entry.id, entry);
      } else if (message.type === 'entry') {
        entries.set(message.entry.id, message.entry);
        if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
      }
      changed();
    });
    opened.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      if (opened !== port) return;
      const wasConnected = connected;
      port = null;
      connected = false;
      // A page load drops the connection; the new page's script is ready a moment later.
      // If we never connected, the page probably predates Ghostfetch: retry briefly, then say so.
      if (wasConnected) retryTimer = setTimeout(() => connect(), 200);
      else if (attempt < 3) retryTimer = setTimeout(() => connect(attempt + 1), 400);
      changed();
    });
  }

  async function refreshTabs() {
    // Every web page is offered, so you can pick one Ghostfetch is off on and turn it on.
    const found = (await chrome.tabs.query({})).filter((tab) => isWebUrl(tab.url));
    tabs = found.map((tab) => ({
      id: tab.id!,
      title: tab.title || tab.url!,
      url: tab.url!,
    }));
    changed();
    return found;
  }

  async function pickTarget() {
    const found = await refreshTabs();
    let tab: chrome.tabs.Tab | undefined;
    if (followActiveTab)
      [tab] = await chrome.tabs.query({
        active: true,
        windowId,
      } as chrome.tabs.QueryInfo);
    if (!running) return;
    if (!isWebUrl(tab?.url)) {
      tab =
        found.find((candidate) => candidate.id === targetId) ||
        found.toSorted((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
    }
    setTarget(tab?.id ?? null);
  }

  function setTarget(id: number | null) {
    if (id === targetId && (port || connected)) return;
    targetId = id;
    targetUrl = tabs.find((tab) => tab.id === id)?.url || '';
    entries = new Map();
    connect();
  }

  // ------------------------------------------------------------ tabs

  const refreshTabsSoon = () => {
    clearTimeout(tabsTimer);
    tabsTimer = setTimeout(refreshTabs, 300);
  };
  const onActivated = (info: chrome.tabs.OnActivatedInfo) => {
    if (followActiveTab && info.windowId === windowId) pickTarget();
  };
  const onUpdated = (tabId: number, info: chrome.tabs.OnUpdatedInfo) => {
    if (info.title || info.url) refreshTabsSoon();
    if (tabId === targetId && info.url) {
      targetUrl = info.url;
      changed();
    }
    if (tabId === targetId && info.status === 'complete' && !port && !connected)
      connect();
  };
  const onRemoved = (tabId: number) => {
    if (tabId === targetId) {
      targetId = null;
      pickTarget();
    } else {
      refreshTabsSoon();
    }
  };

  return {
    // For React's useSyncExternalStore.
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => current,

    start() {
      running = true;
      chrome.tabs.onActivated.addListener(onActivated);
      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs.onCreated.addListener(refreshTabsSoon);
      chrome.tabs.onRemoved.addListener(onRemoved);
      chrome.windows.getCurrent().then((window) => {
        windowId = window.id;
        if (running) pickTarget();
      });
    },
    stop() {
      running = false;
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onCreated.removeListener(refreshTabsSoon);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(retryTimer);
      clearTimeout(tabsTimer);
      retryTimer = undefined;
      cancelAnimationFrame(frame);
      frame = 0;
      port?.disconnect();
      port = null;
      connected = false;
    },

    // The page picker.
    setTarget,
    // Clears the log here and in the page, so a reload doesn't bring the requests back.
    clear() {
      port?.postMessage({ type: 'clear' } satisfies LogViewerMessage);
      entries = new Map();
      changed();
    },
  };
}
