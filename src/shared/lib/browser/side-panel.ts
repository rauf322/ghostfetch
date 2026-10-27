// Chrome has a side panel; Firefox and its forks (Zen) have a sidebar instead (firefox.d.ts). Both
// only open from inside a click, so call this synchronously in the handler, before any await.
export function openSidePanel(windowId: number) {
  return chrome.sidePanel
    ? chrome.sidePanel.open({ windowId })
    : chrome.sidebarAction.open();
}
