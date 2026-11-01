// Everything Ghostfetch keeps, as the background reads it: chrome.storage.local holds
// { enabled, record, sites, rules }.
import { normalizeRules, normalizeSites } from '../../shared/api/index.ts';
import type { Rule } from '../../shared/api/index.ts';

export interface StoredState {
  enabled: boolean;
  record: boolean;
  sites: string[];
  rules: Rule[];
}

const DEFAULTS: StoredState = {
  enabled: true,
  record: true,
  sites: [],
  rules: [],
};

export async function loadState(): Promise<StoredState> {
  // Whatever is stored, so every field is checked below before it's used.
  const stored = (await chrome.storage.local.get(DEFAULTS)) as StoredState;
  return {
    enabled: stored.enabled,
    record: stored.record,
    sites: normalizeSites(stored.sites),
    rules: normalizeRules(stored.rules),
  };
}
