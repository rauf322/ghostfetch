// Service worker (Chrome) or event page (Firefox). Registers the content scripts for the sites
// you added (the built-in hosts have theirs in the manifest, see wxt.config.ts), keeps the toolbar
// badge in sync, and passes the requests an iframe logs on to its tab. The rules themselves are
// applied inside the page by the interceptor (src/app/interceptor/).
//
// This file adds the listeners; what each one does is in a file of its own beside it.
import { defineBackground } from 'wxt/utils/define-background';
import { onMessage } from './on-message.ts';
import { scheduleSync } from './schedule-sync.ts';

// Every listener is added synchronously when the worker starts, so the event that woke it is
// delivered.
export default defineBackground(() => {
  chrome.runtime.onMessage.addListener(onMessage);
  chrome.runtime.onInstalled.addListener(() => {
    // Up to 0.8, the local.* hosts opened so far, for redirect, header and block rules.
    chrome.storage.local.remove('localHosts').catch(() => {});
    scheduleSync();
  });
  chrome.runtime.onStartup.addListener(() => scheduleSync());
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.sites) scheduleSync();
    else if (changes.rules || changes.enabled) scheduleSync({ scripts: false });
  });
});
