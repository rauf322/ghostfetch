// Redirect, header and block rules as the browser's declarativeNetRequest dynamic rules
// (to-dnr-rule.ts), for requests started by the hosts Ghostfetch runs on. Each sync replaces them
// with the rules that are on, keeps in session storage why the browser rejected any (dnrErrors,
// which the editor shows on the rule) and which rule each came from (dnrMap, for the hits in the
// Traffic log), then updates the toolbar badge.
import { BUILT_IN_SITES } from '../../entities/site/index.ts';
import { updateBadge } from './badge.ts';
import type { StoredState } from './stored-state.ts';
import { toDnrRule } from './to-dnr-rule.ts';
import type { DnrRule } from './to-dnr-rule.ts';

export async function syncRules({ enabled, sites, rules, localHosts }: StoredState) {
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
