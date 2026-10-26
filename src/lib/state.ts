// In-memory copy of the extension's storage for the editor and popup. Rule edits are
// saved with a short debounce; changes made in another view (popup, other window) are
// picked up through chrome.storage.onChanged. The screens read `state` while they render and
// re-render through useUiState().
import { useSyncExternalStore } from 'react';
import { loadState, normalizeRule, normalizeSites } from './store.ts';
import type { Rule } from './store.ts';

export interface UiState {
  enabled: boolean;
  record: boolean;
  sites: string[];
  rules: Rule[];
  // Chrome's reason for rejecting a redirect, header or block rule, by rule id.
  dnrErrors: Record<string, string>;
}

// What changed, for subscribers: the switches, the sites, rules edited elsewhere, Chrome's rule
// errors, or an edit made in this view.
export type Change = 'flags' | 'sites' | 'rules' | 'errors' | 'edit';

export const state: UiState = {
  enabled: true,
  record: true,
  sites: [],
  rules: [],
  dnrErrors: {},
};

const listeners = new Set<(kind: Change) => void>();
// Rules are edited in place, so a component can't tell a changed rule from the one it drew. This
// counts every change instead, and useUiState() re-renders when it moves.
let version = 0;
// Every write is tagged with this view's id, so the change event it triggers can be told
// apart from edits made elsewhere. (Comparing contents doesn't work: Chrome returns
// stored objects with their keys sorted, and events can arrive after a newer write.)
const writer = crypto.randomUUID();
let writes = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export async function initState() {
  Object.assign(state, await loadState());
  const { dnrErrors = {} } = await chrome.storage.session.get('dnrErrors');
  state.dnrErrors = dnrErrors as Record<string, string>;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.dnrErrors) {
      state.dnrErrors = (changes.dnrErrors.newValue as Record<string, string>) || {};
      emit('errors');
    }
    if (area !== 'local') return;
    if (changes.enabled || changes.record) {
      if (changes.enabled) state.enabled = (changes.enabled.newValue as boolean) ?? true;
      if (changes.record) state.record = (changes.record.newValue as boolean) ?? true;
      emit('flags');
    }
    if (changes.sites) {
      state.sites = normalizeSites(changes.sites.newValue);
      emit('sites');
    }
    if (
      changes.rules &&
      !(changes.rulesWriter?.newValue as string | undefined)?.startsWith(`${writer}:`)
    ) {
      clearTimeout(saveTimer!);
      saveTimer = null;
      state.rules = ((changes.rules.newValue as unknown[]) || []).map((rule) =>
        normalizeRule(rule),
      );
      emit('rules');
    }
  });

  // Don't lose the last few keystrokes if the panel is closed mid-debounce.
  window.addEventListener('pagehide', () => {
    if (saveTimer) saveRules({ immediate: true });
  });
}

export function subscribe(listener: (kind: Change) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(kind: Change) {
  version += 1;
  for (const listener of listeners) listener(kind);
}

// For a component that reads `state`: it re-renders after every change, made here or elsewhere.
export function useUiState() {
  useSyncExternalStore(subscribe, () => version);
  return state;
}

// Writes the rules to storage, at once or after a short pause. Not exported: every change goes
// through the functions below, which also tell the screens to redraw.
function saveRules({ immediate = false } = {}) {
  clearTimeout(saveTimer!);
  const write = () => {
    saveTimer = null;
    chrome.storage.local.set({
      rules: state.rules,
      rulesWriter: `${writer}:${++writes}`,
    });
  };
  if (immediate) write();
  else saveTimer = setTimeout(write, 250);
}

export function findRule(id: string | null | undefined) {
  return state.rules.find((rule) => rule.id === id);
}

export function addRule(rule: Rule, index = state.rules.length) {
  addRules([rule], index);
  return rule;
}

export function addRules(rules: Rule[], index = state.rules.length) {
  state.rules.splice(index, 0, ...rules);
  saveRules({ immediate: true });
  emit('edit');
}

export function removeRule(id: string) {
  const index = state.rules.findIndex((rule) => rule.id === id);
  if (index === -1) return null;
  const [removed] = state.rules.splice(index, 1);
  saveRules({ immediate: true });
  emit('edit');
  return { rule: removed!, index };
}

export function moveRule(id: string, toIndex: number) {
  const from = state.rules.findIndex((rule) => rule.id === id);
  if (from === -1) return;
  const [rule] = state.rules.splice(from, 1);
  state.rules.splice(from < toIndex ? toIndex - 1 : toIndex, 0, rule!);
  saveRules({ immediate: true });
  emit('edit');
}

// After changing a rule in place: saves it (after a short pause, or `immediate`ly, as the popup
// does because it can close at any moment) and redraws.
export function touchRule(rule: Rule, { immediate = false } = {}) {
  rule.updatedAt = Date.now();
  saveRules({ immediate });
  emit('edit');
}

export function setFlag(key: 'enabled' | 'record', value: boolean) {
  state[key] = value;
  chrome.storage.local.set({ [key]: value });
  emit('flags');
}

// Saves the list of sites you added and resolves once the service worker has re-registered
// the content scripts, so a tab reloaded right after picks up the change.
export async function setSites(sites: string[]) {
  state.sites = normalizeSites(sites);
  await chrome.storage.local.set({ sites: state.sites });
  await chrome.runtime.sendMessage({ type: 'mocktail:sync' });
  emit('sites');
}
