// Firefox's sidebar API, which @types/chrome (Chrome's APIs) doesn't describe. Only what
// Ghostfetch calls: opening the sidebar from a click, as Chrome's sidePanel.open() does.
declare global {
  namespace chrome.sidebarAction {
    function open(): Promise<void>;
  }
}

export {};
