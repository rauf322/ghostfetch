// Opening the editor: in Chrome's side panel (Firefox's sidebar) or a tab of its own, and on a
// particular rule, which the popup asks for and the editor opens when it's ready.
import { openSidePanel } from '../../../shared/lib/browser/index.ts';

// The popup's request for a rule, held in session storage until the editor takes it.
const REQUESTED_RULE = 'focusRule';

// Opens the editor in the side panel, then closes this page (the popup, or the editor's own tab).
// Only works inside a click, so call it synchronously in the handler, before any await.
export function openInSidePanel(windowId: number) {
  openSidePanel(windowId).then(() => window.close());
}

export function openInTab() {
  chrome.runtime.openOptionsPage();
}

// From the popup: the editor opens in the side panel, on this rule.
export function openRuleInEditor(id: string, windowId: number) {
  chrome.storage.session.set({ [REQUESTED_RULE]: id });
  openInSidePanel(windowId);
}

// For the editor: calls `onRule` with each rule the popup asks for, including one it asked for
// before the editor opened. Returns a function that stops watching.
export function watchRuleRequests(onRule: (id: string) => void) {
  async function takeRequest() {
    const { [REQUESTED_RULE]: id } = await chrome.storage.session.get(REQUESTED_RULE);
    if (!id) return;
    await chrome.storage.session.remove(REQUESTED_RULE);
    onRule(id as string);
  }
  const onChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === 'session' && changes[REQUESTED_RULE]?.newValue) takeRequest();
  };
  chrome.storage.onChanged.addListener(onChanged);
  takeRequest();
  return () => chrome.storage.onChanged.removeListener(onChanged);
}
