// Firefox's sidebar API, which @types/chrome (Chrome's APIs) doesn't describe. Only what
// Ghostfetch calls: opening the sidebar from a click, as Chrome's sidePanel.open() does.
// No imports or exports, so this file adds to the global `chrome` namespace as it stands.
declare namespace chrome.sidebarAction {
  function open(): Promise<void>;
}
