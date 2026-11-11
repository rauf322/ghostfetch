// The editor's live log of a tab's requests: picks the tab to watch, connects to the
// "ghostfetch-log" port of that tab's bridge (src/app/bridge/) and keeps the requests it reports.
// The editor runs one for as long as it's open: Traffic lists it, a rule says how often it fired
// there, and New rule offers what the page just asked for. No DOM: a view draws snapshot() and
// draws again when subscribe() says it changed, at most once a frame, however many requests
// arrive.
import type { LogEntry } from './log-entry.ts';
import type { LogPortMessage, LogViewerMessage } from './messages.ts';

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
  // The page being watched, as the list of tabs last had it, or null with no web page open.
  target: TrafficTab | null;
  // Its URL, kept up to date as it navigates, ahead of the list of tabs.
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
  // Whether the requests from before a page load stay when it reloads (Keep on reload).
  preserve: () => boolean;
}

// What createTrafficLog() returns, for the components that use it.
export type TrafficLog = ReturnType<typeof createTrafficLog>;

export function createTrafficLog({ followActiveTab, preserve }: TrafficLogOptions) {
  let entries = new Map<string, LogEntry>();
  let tabs: TrafficTab[] = [];
  let targetId: number | null = null;
  let targetUrl = '';
  // The page watched is one you picked in the page picker, which the side panel keeps until you
  // switch tabs, rather than the one it would follow its tab to.
  let picked = false;
  // How many times the page to watch has been looked for: of two searches under way, the later
  // one decides (pickTarget()).
  let picks = 0;
  let port: chrome.runtime.Port | null = null;
  let connected = false;
  // Clear was clicked since the page's log so far began to arrive. The page sent all its parts at
  // once, before it heard of the Clear: those still on their way ('more') were cleared too.
  let cleared = false;
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
      target: tabs.find((tab) => tab.id === targetId) ?? null,
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
        cleared = false;
        if (!preserve()) entries = new Map();
        for (const entry of message.entries) entries.set(entry.id, entry);
      } else if (message.type === 'more') {
        // The rest of a long log so far, in order (messages.ts), unless Clear came first.
        if (cleared) return;
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

  // Looks for the page to watch, and watches it unless it's the one watched already: the side
  // panel's own tab if that shows a web page; otherwise the page watched so far, if it's still
  // open and a web page (`gone`: a tab just closed, which isn't), or else the one used last.
  async function pickTarget({ gone }: { gone?: number } = {}) {
    const pick = ++picks;
    const found = (await refreshTabs()).filter((candidate) => candidate.id !== gone);
    let tab: chrome.tabs.Tab | undefined;
    if (followActiveTab)
      [tab] = await chrome.tabs.query({
        active: true,
        windowId,
      } as chrome.tabs.QueryInfo);
    if (!running || pick !== picks) return;
    if (!isWebUrl(tab?.url)) {
      tab =
        found.find((candidate) => candidate.id === targetId) ||
        found.toSorted((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
    }
    picked = false;
    const id = tab?.id ?? null;
    if (id !== targetId) watch(id);
  }

  function watch(id: number | null) {
    if (id === targetId && (port || connected)) return;
    targetId = id;
    targetUrl = tabs.find((tab) => tab.id === id)?.url || '';
    entries = new Map();
    connect();
  }

  // ------------------------------------------------------------ tabs

  // The list of pages again, a moment after the tabs change, and the page to watch if the one
  // watched isn't in the list any more (its tab went on to a page that isn't a web page) or
  // there was none to watch.
  const refreshTabsSoon = () => {
    clearTimeout(tabsTimer);
    tabsTimer = setTimeout(async () => {
      const found = await refreshTabs();
      if (running && !found.some((tab) => tab.id === targetId)) pickTarget();
    }, 300);
  };
  const onActivated = (info: chrome.tabs.OnActivatedInfo) => {
    if (followActiveTab && info.windowId === windowId) pickTarget();
  };
  const onUpdated = (
    tabId: number,
    info: chrome.tabs.OnUpdatedInfo,
    tab: chrome.tabs.Tab,
  ) => {
    // The status too: of a page an extension can't see (about:blank, chrome://…) Chrome gives
    // neither the URL nor the title, so its status is all that says the tab moved on.
    if (info.title || info.url || info.status) refreshTabsSoon();
    if (tabId === targetId && info.url) {
      targetUrl = info.url;
      changed();
    }
    // The side panel's own tab opened a web page (a new tab, then an address typed in it): that's
    // the page to watch now, unless you picked another.
    if (
      followActiveTab &&
      !picked &&
      info.url &&
      tabId !== targetId &&
      tab.active &&
      tab.windowId === windowId
    )
      pickTarget();
    if (tabId === targetId && info.status === 'complete' && !port && !connected)
      connect();
  };
  const onRemoved = (tabId: number) => {
    if (tabId === targetId) pickTarget({ gone: tabId });
    else refreshTabsSoon();
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

    // The page picker: a page you picked.
    setTarget(id: number) {
      picked = true;
      watch(id);
    },
    // Clears the log here and in the page, so a reload doesn't bring the requests back, nor the
    // rest of the log so far if it's still arriving.
    clear() {
      port?.postMessage({ type: 'clear' } satisfies LogViewerMessage);
      entries = new Map();
      cleared = true;
      changed();
    },
  };
}
