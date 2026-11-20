// The editor's and the popup's copy of the rules and their groups in storage. Rule edits are saved
// with a short debounce; changes made in another view (popup, other window) are picked up through
// chrome.storage.onChanged. The screens read ruleStore.state while they render and redraw through
// useStore(ruleStore); a component that draws one rule can skip a redraw its rule's revision
// (ruleRevision()) says it doesn't need.
//
// The order (GLOSSARY.md, docs/adr/0001) is one list of ungrouped rules and groups, each group's
// rules together in its place: `entries` is its top level, which the screens draw; `rules` every
// rule in it from the top, the order the page tries them in; `groups` every group in it. It's kept
// as two lists: `rules` as it always has been, each rule saying which group it's in, which is what
// the page reads (the bridge) and what an older version would read; and `groups`, each with its
// place among the top-level entries (`at`), which is also where a group with no rules stands.
import { createStore } from '../../lib/index.ts';
import { freeName, normalizeGroups } from './group.ts';
import type { StoredGroup } from './group.ts';
import { normalizeRules } from './rule.ts';
import type { Group, Rule } from './types.ts';

// One of the order's top-level entries: an ungrouped rule, or a group with its rules.
export interface RuleEntry {
  kind: 'rule';
  rule: Rule;
}
export interface GroupEntry {
  kind: 'group';
  group: Group;
  rules: Rule[];
}
export type Entry = RuleEntry | GroupEntry;

// Where a rule goes: in a group (its id) at `index` among its rules, or ungrouped ('') at `index`
// among the top-level entries. 0 is the top.
export interface Place {
  group: string;
  index: number;
}

interface RuleState {
  entries: Entry[];
  rules: Rule[];
  groups: Group[];
}
// What changed, for subscribers: rules edited elsewhere, or an edit made in this view.
export type RuleChange = 'rules' | 'edit';

const state: RuleState = { entries: [], rules: [], groups: [] };
export const ruleStore = /* @__PURE__ */ createStore<RuleState, RuleChange>(state);

// Every write is tagged with this view's id, so the change event it triggers can be told
// apart from edits made elsewhere. (Comparing contents doesn't work: Chrome returns
// stored objects with their keys sorted, and events can arrive after a newer write.)
let writer = '';
let writes = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export async function initRules() {
  writer = crypto.randomUUID();
  const stored = await chrome.storage.local.get({ rules: [], groups: [] });
  read(stored.rules, stored.groups);

  chrome.storage.onChanged.addListener((changed, area) => {
    if (
      area === 'local' &&
      (changed.rules || changed.groups) &&
      !(changed.rulesWriter?.newValue as string | undefined)?.startsWith(`${writer}:`)
    ) {
      clearTimeout(saveTimer!);
      saveTimer = null;
      // A view writes both; one that wrote only one of them left the other as it was here.
      read(
        changed.rules ? changed.rules.newValue : state.rules,
        changed.groups ? changed.groups.newValue : storedGroups(),
      );
      ruleStore.emit('rules');
    }
  });

  // Don't lose the last few keystrokes if the panel is closed mid-debounce.
  window.addEventListener('pagehide', () => {
    if (saveTimer) saveRules({ immediate: true });
  });
}

function read(rules: unknown, groups: unknown) {
  state.entries = layOut(normalizeRules(rules), normalizeGroups(groups));
  settle();
}

// The order from rules and groups as they're kept (in storage, or in a rules file): each rule in
// its group (one whose group isn't there, ungrouped), and each group at its place among the
// top-level entries, the ungrouped rules filling the rest in their order.
export function layOut(rules: Rule[], groups: StoredGroup[]): Entry[] {
  const blocks = new Map<string, GroupEntry>();
  const placed = groups.map(({ at, ...group }) => {
    const entry: GroupEntry = { kind: 'group', group, rules: [] };
    blocks.set(group.id, entry);
    return { at, entry };
  });
  const loose: RuleEntry[] = [];
  for (const rule of rules) {
    const block = blocks.get(rule.group);
    if (block) block.rules.push(rule);
    else {
      rule.group = '';
      loose.push({ kind: 'rule', rule });
    }
  }
  const entries: Entry[] = [];
  let next = 0;
  for (const { at, entry } of placed.toSorted((a, b) => a.at - b.at)) {
    while (entries.length < at && next < loose.length) entries.push(loose[next++]!);
    entries.push(entry);
  }
  entries.push(...loose.slice(next));
  return entries;
}

// `rules` and `groups` from the entries, after any change to the order.
function settle() {
  state.rules = state.entries.flatMap((entry) =>
    entry.kind === 'rule' ? [entry.rule] : entry.rules,
  );
  state.groups = state.entries.flatMap((entry) =>
    entry.kind === 'group' ? [entry.group] : [],
  );
}

// The groups as they're kept, each with its place among the top-level entries: in storage, and in
// an exported file.
export function storedGroups(): StoredGroup[] {
  return state.entries.flatMap((entry, at) =>
    entry.kind === 'group' ? [{ ...entry.group, at }] : [],
  );
}

// Writes the rules and the groups to storage, at once or after a short pause. Not exported: every
// change goes through the functions below, which also tell the screens to redraw.
function saveRules({ immediate = false } = {}) {
  clearTimeout(saveTimer!);
  const write = () => {
    saveTimer = null;
    chrome.storage.local.set({
      rules: state.rules,
      groups: storedGroups(),
      rulesWriter: `${writer}:${++writes}`,
    });
  };
  if (immediate) write();
  else saveTimer = setTimeout(write, 250);
}

// Writes an edit that's waiting out the pause now: vim's Space s and :w, saving as an editor does.
export function saveRulesNow() {
  if (saveTimer) saveRules({ immediate: true });
}

export function findRule(id: string | null | undefined) {
  return state.rules.find((rule) => rule.id === id);
}

export function findGroup(id: string | null | undefined) {
  return id ? state.groups.find((group) => group.id === id) : undefined;
}

// The group with this name, ignoring case and spaces at its ends: names are unique.
export function findGroupNamed(name: string) {
  const key = name.trim().toLowerCase();
  return state.groups.find((group) => group.name.toLowerCase() === key);
}

// The group a rule is in, if any.
export function groupOf(rule: Rule) {
  return findGroup(rule.group);
}

// Whether a rule is in a group that's off, so it doesn't answer, whatever its own switch says.
export function inOffGroup(rule: Rule) {
  return groupOf(rule)?.enabled === false;
}

function groupIndex(id: string) {
  return state.entries.findIndex(
    (entry) => entry.kind === 'group' && entry.group.id === id,
  );
}

function blockOf(id: string) {
  const entry = state.entries[groupIndex(id)];
  return entry?.kind === 'group' ? entry : undefined;
}

// Where a rule is: its group and its index there, or '' and its index among the top-level entries.
export function placeOf(id: string): Place | null {
  for (const [at, entry] of state.entries.entries()) {
    if (entry.kind === 'rule') {
      if (entry.rule.id === id) return { group: '', index: at };
      continue;
    }
    const index = entry.rules.findIndex((rule) => rule.id === id);
    if (index !== -1) return { group: entry.group.id, index };
  }
  return null;
}

// The place for a rule to be tried `position`th (0 is first), in a group or none: in a group, as
// near to that as the group's block allows; ungrouped, before the top-level entry it falls in, so
// never inside a group. What the agent's position means (pages/agent).
export function placeAt(position: number, group = ''): Place {
  const block = group ? blockOf(group) : undefined;
  let before = 0;
  for (const [at, entry] of state.entries.entries()) {
    if (block) {
      if (entry === block)
        return { group, index: clamp(position - before, block.rules.length) };
    } else if (
      position <= before ||
      (entry.kind === 'group' && position < before + entry.rules.length)
    )
      return { group: '', index: at };
    before += entry.kind === 'rule' ? 1 : entry.rules.length;
  }
  return { group: '', index: state.entries.length };
}

function clamp(value: number, max: number) {
  return Math.min(Math.max(Math.trunc(value) || 0, 0), max);
}

// Puts rules at a place, each told which group it's in now. A group that isn't there (deleted
// meanwhile) puts them at the top, ungrouped.
function put(rules: Rule[], place: Place) {
  const block = place.group ? blockOf(place.group) : undefined;
  if (block) {
    for (const rule of rules) rule.group = block.group.id;
    block.rules.splice(clamp(place.index, block.rules.length), 0, ...rules);
    return;
  }
  for (const rule of rules) rule.group = '';
  state.entries.splice(
    place.group ? 0 : clamp(place.index, state.entries.length),
    0,
    ...rules.map((rule): RuleEntry => ({ kind: 'rule', rule })),
  );
}

// Takes a rule out of the order, and says where it was.
function take(id: string) {
  const place = placeOf(id);
  if (!place) return null;
  const rule = place.group
    ? blockOf(place.group)!.rules.splice(place.index, 1)[0]!
    : (state.entries.splice(place.index, 1)[0] as RuleEntry).rule;
  return { rule, place };
}

// After a change to the order: saved at once, and drawn.
function reordered() {
  settle();
  saveRules({ immediate: true });
  ruleStore.emit('edit');
}

// A new rule, at the top unless it's put elsewhere.
export function addRule(rule: Rule, place: Place = { group: '', index: 0 }) {
  addRules([rule], place);
  return rule;
}

export function addRules(rules: Rule[], place: Place = { group: '', index: 0 }) {
  put(rules, place);
  reordered();
}

// Deletes a rule, and says where it was, for Undo (addRule(rule, place)).
export function removeRule(id: string) {
  const removed = take(id);
  if (!removed) return null;
  reordered();
  return removed;
}

// Moves a rule to a place given as the order stands with the rule still in it, as a drag sees
// it: before what's at that index now.
export function moveRule(id: string, place: Place) {
  const from = placeOf(id);
  if (!from) return;
  const { rule } = take(id)!;
  const index =
    from.group === place.group && from.index < place.index
      ? place.index - 1
      : place.index;
  put([rule], { group: place.group, index });
  reordered();
}

// Moves a rule to be tried `position`th once it's there (0 is first), in a group (its id) or none
// (''), or in its own if none is given: as near to that as the group's block allows (placeAt()).
// What the agent's position means.
export function moveRuleTo(id: string, position: number, group?: string) {
  const taken = take(id);
  if (!taken) return;
  put([taken.rule], placeAt(position, group ?? taken.place.group));
  reordered();
}

// Moves a group to `index` among the top-level entries once it's there (0 is the top).
export function moveGroupTo(id: string, index: number) {
  const from = groupIndex(id);
  if (from === -1) return;
  const [entry] = state.entries.splice(from, 1);
  state.entries.splice(clamp(index, state.entries.length), 0, entry!);
  reordered();
}

// Where a group stands among the top-level entries, or -1.
export function groupPosition(id: string) {
  return groupIndex(id);
}

// Entries from a rules file, at the top, in the file's order.
export function addEntries(entries: Entry[]) {
  state.entries.unshift(...entries);
  reordered();
}

// A group, at `index` among the top-level entries, with the rules given in it: a copy's, or none
// yet.
export function addGroup(group: Group, index = 0, rules: Rule[] = []) {
  for (const rule of rules) rule.group = group.id;
  state.entries.splice(clamp(index, state.entries.length), 0, {
    kind: 'group',
    group,
    rules,
  });
  reordered();
  return group;
}

// Deletes a group and its rules, and says where it was, for Undo (restoreGroup()).
export function removeGroup(id: string) {
  const index = groupIndex(id);
  if (index === -1) return null;
  const entry = state.entries.splice(index, 1)[0] as GroupEntry;
  reordered();
  return { group: entry.group, rules: entry.rules, index };
}

// A deleted group back where it was, with its rules: under another name if one made meanwhile has
// its own.
export function restoreGroup({
  group,
  rules,
  index,
}: {
  group: Group;
  rules: Rule[];
  index: number;
}) {
  group.name = freeName(group.name, state.groups, 'brackets');
  addGroup(group, index, rules);
}

// Takes a group away and leaves its rules where it was, ungrouped.
export function ungroup(id: string) {
  const index = groupIndex(id);
  if (index === -1) return;
  const entry = state.entries[index] as GroupEntry;
  for (const rule of entry.rules) rule.group = '';
  state.entries.splice(
    index,
    1,
    ...entry.rules.map((rule): RuleEntry => ({ kind: 'rule', rule })),
  );
  reordered();
}

// Moves a group to `index` among the top-level entries, given as the order stands with the group
// still in it: before what's at that index now.
export function moveGroup(id: string, index: number) {
  const from = groupIndex(id);
  if (from === -1) return;
  const [entry] = state.entries.splice(from, 1);
  state.entries.splice(
    clamp(from < index ? index - 1 : index, state.entries.length),
    0,
    entry!,
  );
  reordered();
}

// A change to a group (its name, its switch), saved at once: the popup can close at any moment.
export function editGroup(id: string, change: (group: Group) => void) {
  const group = findGroup(id);
  if (!group) return;
  change(group);
  group.updatedAt = Date.now();
  saveRules({ immediate: true });
  ruleStore.emit('edit');
}

// How many times each rule has been changed in place here (touchRule()). A rule is changed in
// place, so a component that drew it can't tell from the rule itself whether it has changed since;
// its revision moves on each change. Its updatedAt can't serve, as two edits in the same
// millisecond have the same one. A rule changed in another view is a new copy, at 0.
const revisions = new WeakMap<Rule, number>();
export function ruleRevision(rule: Rule) {
  return revisions.get(rule) ?? 0;
}

// After changing a rule in place: saves it (after a short pause, or `immediate`ly, as the popup
// does because it can close at any moment) and redraws.
export function touchRule(rule: Rule, { immediate = false } = {}) {
  rule.updatedAt = Date.now();
  revisions.set(rule, ruleRevision(rule) + 1);
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
