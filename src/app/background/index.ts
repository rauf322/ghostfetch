// Service worker (Chrome) or event page (Firefox). Registers the content scripts for the sites
// you added (the built-in hosts have theirs in the manifest, see wxt.config.ts), turns redirect,
// header and block rules into declarativeNetRequest rules scoped to all those hosts, keeps the
// toolbar badge in sync, and forwards rule hits to the tab's traffic log. Response rules
// themselves are applied inside the page by interceptor.ts.
import { defineBackground } from 'wxt/utils/define-background';
import { dnrUrlFilter, ruleTitle } from '../../entities/rule/index.ts';
import type { HeaderRow, Rule } from '../../entities/rule/index.ts';
import {
  BUILT_IN_SITES,
  isLocalPrefixHost,
  siteMatchPatterns,
  siteOf,
} from '../../entities/site/index.ts';
import type { RuntimeMessage } from '../messaging/messages.ts';
import { loadState } from './stored-state.ts';
import type { StoredState } from './stored-state.ts';

type DnrRule = chrome.declarativeNetRequest.Rule;

const RESOURCE_TYPES = [
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
] as chrome.declarativeNetRequest.ResourceType[];
const SCRIPT_IDS = ['ghostfetch-interceptor', 'ghostfetch-bridge'];
const MAX_LOCAL_HOSTS = 50;

// Storage changes can arrive in bursts while typing; run syncs one at a time so
// overlapping register/update calls never collide.
let queue = Promise.resolve();
function scheduleSync(what = { scripts: true, rules: true }) {
  queue = queue
    .then(async () => {
      const state = await loadState();
      if (what.scripts) await syncContentScripts(state);
      if (what.rules) await syncRules(state);
    })
    .catch((error) => console.error('[Ghostfetch] sync failed', error));
  return queue;
}

// The sites you added get their content scripts registered at runtime, so they only ever run
// on those sites; every other site never sees Ghostfetch. The files are the same two the
// manifest declares for the built-in hosts.
async function syncContentScripts({ sites }: StoredState) {
  // Every script registered so far, whatever its id: up to 0.6.0 they were "mocktail-interceptor"
  // and "mocktail-bridge", which would otherwise outlive the update and keep running on sites
  // you've since turned off.
  const registered = await chrome.scripting.getRegisteredContentScripts();
  if (registered.length)
    await chrome.scripting.unregisterContentScripts({
      ids: registered.map((script) => script.id),
    });
  if (!sites.length) return;
  const matches = siteMatchPatterns(sites);
  await chrome.scripting.registerContentScripts([
    {
      id: SCRIPT_IDS[0]!,
      js: ['interceptor.js'],
      matches,
      runAt: 'document_start',
      allFrames: true,
      world: 'MAIN',
    },
    {
      id: SCRIPT_IDS[1]!,
      js: ['bridge.js'],
      matches,
      runAt: 'document_start',
      allFrames: true,
    },
  ]);
}

async function syncRules({ enabled, sites, rules, localHosts }: StoredState) {
  const active = enabled
    ? rules.filter((rule) => rule.enabled && rule.type !== 'response')
    : [];
  const initiators = [...BUILT_IN_SITES, ...localHosts, ...sites];
  const errors: Record<string, string> = {};
  const idMap: Record<number, string> = {};
  const candidates: DnrRule[] = [];

  active.forEach((rule, index) => {
    try {
      const dnrRule = toDnrRule(rule, index + 1, initiators);
      candidates.push(dnrRule);
      idMap[dnrRule.id] = rule.id;
    } catch (error) {
      errors[rule.id] = (error as Error).message;
    }
  });

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((rule) => rule.id);
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: candidates,
    });
  } catch {
    // One invalid rule (e.g. an unsupported regex) rejects the whole batch,
    // so add them one at a time to find out which rule is at fault.
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
    for (const dnrRule of candidates) {
      try {
        await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [dnrRule] });
      } catch (error) {
        errors[idMap[dnrRule.id]!] = (error as Error).message;
        delete idMap[dnrRule.id];
      }
    }
  }

  await chrome.storage.session.set({ dnrErrors: errors, dnrMap: idMap });
  updateBadge(enabled, rules);
}

function toDnrRule(rule: Rule, id: number, initiators: string[]): DnrRule {
  const { url, mode, method } = rule.match;
  const pattern = url.trim();
  if (!pattern) throw new Error('Add a URL pattern first.');

  // Only requests started by pages Ghostfetch runs on are touched, never the rest of your browsing.
  const condition: chrome.declarativeNetRequest.RuleCondition = {
    resourceTypes: RESOURCE_TYPES,
    initiatorDomains: initiators,
  };
  if (mode === 'regex') condition.regexFilter = pattern;
  else condition.urlFilter = dnrUrlFilter(mode, pattern);
  if (method && method !== 'ANY')
    condition.requestMethods = [
      method.toLowerCase() as chrome.declarativeNetRequest.RequestMethod,
    ];

  return { id, priority: 1, condition, action: toDnrAction(rule) };
}

function toDnrAction(rule: Rule): chrome.declarativeNetRequest.RuleAction {
  if (rule.type === 'block')
    return { type: 'block' as chrome.declarativeNetRequest.RuleActionType };

  if (rule.type === 'redirect') {
    const to = rule.redirect.to.trim();
    if (!to) throw new Error('Add a destination URL.');
    if (rule.match.mode === 'regex' && /\\\d/.test(to)) {
      return {
        type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
        redirect: { regexSubstitution: to },
      };
    }
    let target;
    try {
      target = new URL(to).href;
    } catch {
      throw new Error(
        `"${to}" is not a full URL. Include the scheme, e.g. http://localhost:3000/api`,
      );
    }
    return {
      type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
      redirect: { url: target },
    };
  }

  const convert = (list: HeaderRow[]) =>
    list
      .filter((row) => row.name.trim())
      .map(
        (row) =>
          (row.op === 'remove'
            ? { header: row.name.trim(), operation: 'remove' }
            : {
                header: row.name.trim(),
                operation: 'set',
                value: row.value ?? '',
              }) as chrome.declarativeNetRequest.ModifyHeaderInfo,
      );
  const requestHeaders = convert(rule.headers.request);
  const responseHeaders = convert(rule.headers.response);
  if (!requestHeaders.length && !responseHeaders.length)
    throw new Error('Add at least one header.');
  return {
    type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
    ...(requestHeaders.length && { requestHeaders }),
    ...(responseHeaders.length && { responseHeaders }),
  };
}

function updateBadge(enabled: boolean, rules: Rule[]) {
  const count = rules.filter((rule) => rule.enabled).length;
  chrome.action.setBadgeBackgroundColor({ color: enabled ? '#7c3aed' : '#6b7280' });
  chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  chrome.action.setBadgeText({ text: !enabled ? 'off' : count ? String(count) : '' });
}

// Only fires for unpacked extensions, which is exactly how Ghostfetch is meant to be installed.
async function onRuleMatched({
  request,
  rule,
}: chrome.declarativeNetRequest.MatchedRuleInfoDebug) {
  if (request.tabId < 0) return;
  const { dnrMap = {} } = await chrome.storage.session.get('dnrMap');
  const ruleId = (dnrMap as Record<number, string>)[rule.ruleId];
  if (!ruleId) return;
  const { rules } = await loadState();
  const matched = rules.find((candidate) => candidate.id === ruleId);
  if (!matched) return;

  const entry = {
    time: Date.now(),
    kind: request.type,
    method: request.method.toUpperCase(),
    url: request.url,
    status: null,
    ruleId,
    ruleName: ruleTitle(matched),
    action: matched.type,
  };
  chrome.tabs
    .sendMessage(request.tabId, { type: 'ghostfetch:dnrHit', entry }, { frameId: 0 })
    .catch(() => {});
}

function onMessage(
  message: RuntimeMessage | undefined,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: boolean) => void,
) {
  // Requests made inside iframes are reported by that frame's bridge; pass them on to the
  // top frame, which owns the tab's traffic log.
  if (message?.type === 'ghostfetch:frameEntry' && sender.tab && sender.frameId) {
    chrome.tabs.sendMessage(sender.tab.id!, message, { frameId: 0 }).catch(() => {});
  }
  // The popup or editor turns a site on or off, then waits for this before reloading the tab.
  if (message?.type === 'ghostfetch:sync' && !sender.tab) {
    scheduleSync().then(() => sendResponse(true));
    return true;
  }
  return undefined;
}

// declarativeNetRequest matches the page that started a request by domain only, so local.*
// hosts can't be listed up front the way localhost can. Each one is remembered the first time
// a tab opens it and added to the rules' initiators, which means requests made during that
// very first load can miss redirect, header and block rules. Response rules aren't affected.
let hostQueue = Promise.resolve();
function rememberLocalHost(url: string) {
  const host = siteOf(url);
  if (!isLocalPrefixHost(host)) return;
  hostQueue = hostQueue
    .then(async () => {
      const { localHosts } = await loadState();
      if (localHosts.includes(host)) return;
      await chrome.storage.local.set({
        localHosts: [...localHosts, host].slice(-MAX_LOCAL_HOSTS),
      });
    })
    .catch((error) => console.error('[Ghostfetch] could not remember host', error));
}

async function rememberOpenTabs() {
  for (const tab of await chrome.tabs.query({})) if (tab.url) rememberLocalHost(tab.url);
}

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
