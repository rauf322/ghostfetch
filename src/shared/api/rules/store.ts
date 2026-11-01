// The editor's and the popup's copy of the rules in storage. Rule edits are saved with a short
// debounce; changes made in another view (popup, other window) are picked up through
// chrome.storage.onChanged. The screens read ruleStore.state while they render and redraw through
// useStore(ruleStore).
import { createStore } from '../../lib/index.ts';
import { normalizeRules } from './rule.ts';
import type { Rule } from './types.ts';

interface RuleState {
  rules: Rule[];
}
// What changed, for subscribers: rules edited elsewhere, or an edit made in this view.
export type RuleChange = 'rules' | 'edit';

const state: RuleState = { rules: [] };
export const ruleStore = /* @__PURE__ */ createStore<RuleState, RuleChange>(state);

// Every write is tagged with this view's id, so the change event it triggers can be told
// apart from edits made elsewhere. (Comparing contents doesn't work: Chrome returns
// stored objects with their keys sorted, and events can arrive after a newer write.)
let writer = '';
let writes = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export async function initRules() {
  writer = crypto.randomUUID();
  const stored = await chrome.storage.local.get({ rules: [] });
  state.rules = normalizeRules(stored.rules);

  chrome.storage.onChanged.addListener((changed, area) => {
    if (
      area === 'local' &&
      changed.rules &&
      !(changed.rulesWriter?.newValue as string | undefined)?.startsWith(`${writer}:`)
    ) {
      clearTimeout(saveTimer!);
      saveTimer = null;
      state.rules = normalizeRules(changed.rules.newValue);
      ruleStore.emit('rules');
    }
  });

  // Don't lose the last few keystrokes if the panel is closed mid-debounce.
  window.addEventListener('pagehide', () => {
    if (saveTimer) saveRules({ immediate: true });
  });
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
  ruleStore.emit('edit');
}

export function removeRule(id: string) {
  const index = state.rules.findIndex((rule) => rule.id === id);
  if (index === -1) return null;
  const [removed] = state.rules.splice(index, 1);
  saveRules({ immediate: true });
  ruleStore.emit('edit');
  return { rule: removed!, index };
}

export function moveRule(id: string, toIndex: number) {
  const from = state.rules.findIndex((rule) => rule.id === id);
  if (from === -1) return;
  const [rule] = state.rules.splice(from, 1);
  state.rules.splice(from < toIndex ? toIndex - 1 : toIndex, 0, rule!);
  saveRules({ immediate: true });
  ruleStore.emit('edit');
}

// After changing a rule in place: saves it (after a short pause, or `immediate`ly, as the popup
// does because it can close at any moment) and redraws.
export function touchRule(rule: Rule, { immediate = false } = {}) {
  rule.updatedAt = Date.now();
  saveRules({ immediate });
  ruleStore.emit('edit');
}

// A change to a rule goes to the stored rule, looked up by its id: an edit made in another view
// replaces every rule with a new copy. Each change is saved as it's made (touchRule), so it applies
// to open tabs right away.
export function editRule(
  id: string,
  change: (rule: Rule) => void,
  { immediate = false } = {},
) {
  const current = findRule(id);
  if (!current) return;
  change(current);
  touchRule(current, { immediate });
}
