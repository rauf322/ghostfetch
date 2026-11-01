// What the background reads of what Ghostfetch keeps: chrome.storage.local holds
// { enabled, record, sites, rules }, and the content scripts and the badge need all but record.
import { normalizeRules, normalizeSites } from '../../shared/api/index.ts';
import type { Rule } from '../../shared/api/index.ts';

export interface StoredState {
  enabled: boolean;
  sites: string[];
  rules: Rule[];
}

const DEFAULTS: StoredState = {
  enabled: true,
  sites: [],
  rules: [],
};

export async function loadState(): Promise<StoredState> {
  // Whatever is stored, so every field is checked below before it's used.
  const stored = (await chrome.storage.local.get(DEFAULTS)) as StoredState;
  return {
    enabled: stored.enabled,
    sites: normalizeSites(stored.sites),
    rules: normalizeRules(stored.rules),
  };
}
