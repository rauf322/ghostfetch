// Service worker (Chrome) or event page (Firefox). Registers the content scripts for the sites
// you added (the built-in hosts have theirs in the manifest, see wxt.config.ts), turns redirect,
// header and block rules into declarativeNetRequest rules scoped to all those hosts, keeps the
// toolbar badge in sync, and forwards rule hits to the tab's traffic log. Response rules
// themselves are applied inside the page by the interceptor (src/app/interceptor/).
//
// This file adds the listeners; what each one does is in a file of its own beside it.
import { defineBackground } from 'wxt/utils/define-background';
import { rememberLocalHost, rememberOpenTabs } from './local-hosts.ts';
import { onMessage } from './on-message.ts';
import { onRuleMatched } from './on-rule-matched.ts';
import { scheduleSync } from './schedule-sync.ts';

// Every listener is added synchronously when the worker starts, so the event that woke it is
// delivered.
export default defineBackground(() => {
  chrome.runtime.onMessage.addListener(onMessage);
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.url) rememberLocalHost(info.url);
  });
  chrome.runtime.onInstalled.addListener(() => {
    scheduleSync();
    rememberOpenTabs();
  });
  chrome.runtime.onStartup.addListener(() => {
    scheduleSync();
    rememberOpenTabs();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.sites) scheduleSync();
    else if (changes.rules || changes.enabled || changes.localHosts)
      scheduleSync({ scripts: false, rules: true });
  });
  chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(onRuleMatched);
});
