// Everything Ghostfetch keeps, as the background reads it: chrome.storage.local holds
// { enabled, record, sites, rules, localHosts }.
import {
  isLocalPrefixHost,
  normalizeRule,
  normalizeSites,
} from '../../shared/api/index.ts';
import type { Rule } from '../../shared/api/index.ts';

export interface StoredState {
  enabled: boolean;
  record: boolean;
  sites: string[];
  rules: Rule[];
  localHosts: string[];
}

const DEFAULTS: StoredState = {
  enabled: true,
  record: true,
  sites: [],
  rules: [],
  localHosts: [],
};

export async function loadState(): Promise<StoredState> {
  // Whatever is stored, so every field is checked below before it's used.
  const stored = (await chrome.storage.local.get(DEFAULTS)) as StoredState;
  return {
    enabled: stored.enabled,
    record: stored.record,
    sites: normalizeSites(stored.sites),
    rules: (Array.isArray(stored.rules) ? stored.rules : []).map((rule) =>
      normalizeRule(rule),
    ),
    // local.* hosts opened so far (local-hosts.ts), which dnr-rules.ts adds to the initiators.
    localHosts: (Array.isArray(stored.localHosts) ? stored.localHosts : []).filter(
      (host) => typeof host === 'string' && isLocalPrefixHost(host),
    ),
  };
}
