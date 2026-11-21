// What the background reads of what Ghostfetch keeps: chrome.storage.local holds
// { enabled, record, sites, rules, groups }, and the content scripts and the badge need all but
// record: of the groups, only which are off.
import { normalizeRules, offGroups } from '../../rules/index.ts';
import type { Rule } from '../../rules/index.ts';
import { normalizeSites } from '../../sites/index.ts';

export interface StoredState {
  enabled: boolean;
  sites: string[];
  rules: Rule[];
  // The ids of the groups that are off: their rules don't answer, whatever their own switches say.
  off: Set<string>;
}

const DEFAULTS = {
  enabled: true,
  sites: [],
  rules: [],
  groups: [],
};

export async function loadState(): Promise<StoredState> {
  // Whatever is stored, so every field is checked below before it's used.
  const stored = (await chrome.storage.local.get(DEFAULTS)) as Record<
    keyof typeof DEFAULTS,
    unknown
  >;
  return {
    enabled: stored.enabled !== false,
    sites: normalizeSites(stored.sites),
    rules: normalizeRules(stored.rules),
    off: offGroups(stored.groups),
  };
}
