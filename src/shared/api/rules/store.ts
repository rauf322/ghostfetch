// The editor's and the popup's copy of the rules and their groups in storage. Rule edits are saved
// with a short debounce; changes made in another view (popup, other window) are picked up through
// chrome.storage.onChanged. The screens read ruleStore.state while they render and redraw through
// useStore(ruleStore); a component that draws one rule can skip a redraw its rule's revision
// (ruleRevision()) says it doesn't need.
//
// The order (docs/glossary/rules.md, docs/adr/0001) is one list of ungrouped rules and groups,
// each group's rules together in its place: `entries` is its top level, which the screens draw;
// `rules` every rule in it from the top, the order the page tries them in; `groups` every group
// in it. A change to it is one of the order's own operations (order.ts) on `entries`, which this
// file then saves and draws; how the order is kept, and heard of from another view, is
// order-storage.ts's. The order's operations go by the names this file's own have, so each is
// imported here with `order` before its name.
import { createStore } from '../../lib/index.ts';
import type { StoredGroup } from './group.ts';
import { readOrder, saveOrder, saveOrderNow, watchOrder } from './order-storage.ts';
import {
  addEntries as orderAddEntries,
  addGroup as orderAddGroup,
  groupIndex,
  groupsIn,
  moveGroup as orderMoveGroup,
  moveGroupTo as orderMoveGroupTo,
  moveRule as orderMoveRule,
  moveRuleTo as orderMoveRuleTo,
  placeAt as orderPlaceAt,
  placeOf as orderPlaceOf,
  put,
  removeGroup as orderRemoveGroup,
  renameGroup as orderRenameGroup,
  rulesIn,
  storedGroups as orderStoredGroups,
  take,
  turnGroup as orderTurnGroup,
  ungroup as orderUngroup,
} from './order.ts';
import type { Entry, Place } from './order.ts';
import type { Group, Rule } from './types.ts';

interface RuleState {
  entries: Entry[];
  rules: Rule[];
  groups: Group[];
}
// What changed, for subscribers: rules edited elsewhere, or an edit made in this view.
export type RuleChange = 'rules' | 'edit';

const state: RuleState = { entries: [], rules: [], groups: [] };
export const ruleStore = /* @__PURE__ */ createStore<RuleState, RuleChange>(state);

export async function initRules() {
  read(await readOrder());
  watchOrder(
    () => state.entries,
    (order) => {
      read(order);
      ruleStore.emit('rules');
    },
  );
}

// The order as storage has it, in place of the one here: as a view opens, and each time another
// view writes it.
function read(order: Entry[]) {
  state.entries = order;
  settle();
}

// `rules` and `groups` from the entries, after any change to the order.
function settle() {
  state.rules = rulesIn(state.entries);
  state.groups = groupsIn(state.entries);
}

// The groups as they're kept, each with its place among the top-level entries: in storage, and in
// an exported file.
export function storedGroups(): StoredGroup[] {
  return orderStoredGroups(state.entries);
}

// Writes an edit that's waiting out the pause now: vim's Space s and :w, saving as an editor does.
export function saveRulesNow() {
  saveOrderNow();
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

// Where a rule is: its group and its index there, or '' and its index among the top-level entries.
export function placeOf(id: string): Place | null {
  return orderPlaceOf(state.entries, id);
}

// The place for a rule to be tried `position`th (0 is first), in a group or none: in a group, as
// near to that as the group's block allows; ungrouped, before the top-level entry it falls in, so
// never inside a group. What the agent's position means (pages/agent).
export function placeAt(position: number, group = ''): Place {
  return orderPlaceAt(state.entries, position, group);
}

// After a change to the order: saved at once, and drawn.
function reordered() {
  settle();
  saveOrder({ immediate: true });
  ruleStore.emit('edit');
}

// A new rule, at the top unless it's put elsewhere.
export function addRule(rule: Rule, place: Place = { group: '', index: 0 }) {
  addRules([rule], place);
  return rule;
}

export function addRules(rules: Rule[], place: Place = { group: '', index: 0 }) {
  put(state.entries, rules, place);
  reordered();
}

// Deletes a rule, and says where it was, for Undo (addRule(rule, place)).
export function removeRule(id: string) {
  const removed = take(state.entries, id);
  if (!removed) return null;
  reordered();
  return removed;
}

// Moves a rule to a place given as the order stands with the rule still in it, as a drag sees
// it: before what's at that index now.
export function moveRule(id: string, place: Place) {
  if (orderMoveRule(state.entries, id, place)) reordered();
}

// Moves a rule to be tried `position`th once it's there (0 is first), in a group (its id) or none
// (''), or in its own if none is given: as near to that as the group's block allows (placeAt()).
// What the agent's position means.
export function moveRuleTo(id: string, position: number, group?: string) {
  if (orderMoveRuleTo(state.entries, id, position, group)) reordered();
}

// Moves a group to `index` among the top-level entries once it's there (0 is the top).
export function moveGroupTo(id: string, index: number) {
  if (orderMoveGroupTo(state.entries, id, index)) reordered();
}

// Where a group stands among the top-level entries, or -1.
export function groupPosition(id: string) {
  return groupIndex(state.entries, id);
}

// Entries from a rules file, at the top, in the file's order.
export function addEntries(entries: Entry[]) {
  orderAddEntries(state.entries, entries);
  reordered();
}

// A group, at `index` among the top-level entries, with the rules given in it: a copy's, or none
// yet.
export function addGroup(group: Group, index = 0, rules: Rule[] = []) {
  orderAddGroup(state.entries, group, index, rules);
  reordered();
  return group;
}

// Deletes a group and its rules, and says where it was, for Undo (restoreGroup()).
export function removeGroup(id: string) {
  const removed = orderRemoveGroup(state.entries, id);
  if (!removed) return null;
  reordered();
  return removed;
}

// A deleted group back where it was, with its rules: under another name if one made meanwhile has
// its own, as any group that comes into the order is.
export function restoreGroup({
  group,
  rules,
  index,
}: {
  group: Group;
  rules: Rule[];
  index: number;
}) {
  addGroup(group, index, rules);
}

// Takes a group away and leaves its rules where it was, ungrouped.
export function ungroup(id: string) {
  if (orderUngroup(state.entries, id)) reordered();
}

// Moves a group to `index` among the top-level entries, given as the order stands with the group
// still in it: before what's at that index now.
export function moveGroup(id: string, index: number) {
  if (orderMoveGroup(state.entries, id, index)) reordered();
}

// Renames a group, saved at once: the popup can close at any moment. The order refuses a name
// with nothing in it and one another group has, and leaves a group that has the name already as
// it is: what comes back says which (Renamed, order.ts), for whoever asked to say so in their own
// words.
export function renameGroup(id: string, name: string) {
  const renamed = orderRenameGroup(state.entries, id, name);
  if (renamed === 'renamed') {
    saveOrder({ immediate: true });
    ruleStore.emit('edit');
  }
  return renamed;
}

// Turns a group on or off, saved at once: the popup can close at any moment.
export function turnGroup(id: string, on: boolean) {
  if (!orderTurnGroup(state.entries, id, on)) return;
  saveOrder({ immediate: true });
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
  saveOrder({ immediate });
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
