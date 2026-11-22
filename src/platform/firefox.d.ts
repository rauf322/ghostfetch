// What Firefox has and @types/chrome (Chrome's APIs) doesn't describe. Only what Ghostfetch calls:
// opening the sidebar from a click, as Chrome's sidePanel.open() does; and the data collection
// consent of Firefox 140 and later, which Agent access asks for (agent-access/).
// No imports or exports, so this file adds to the global `chrome` namespace as it stands.
declare namespace chrome.sidebarAction {
  function open(): Promise<void>;
}

declare namespace chrome.permissions {
  interface Permissions {
    // Data types from the manifest's data_collection_permissions, such as "websiteContent".
    data_collection?: string[];
  }
}
