// The order (docs/glossary/rules.md, docs/adr/0001): the one list the rules are tried in from the
// top, of ungrouped rules and groups, each group's rules together in its place. An order here is
// its top-level entries, and each operation on it is a function of them: it changes the order it's
// given, and the rules and groups in it, in place, and touches nothing else. A rule or a group
// stays the same object through every one of them, as the screens tell a rule by that and by its
// revision (store.ts). Keeping the order is order-storage.ts's and telling the screens of a change
// store.ts's; the page's bridge lays the stored rules out with layOut() as the screens do, and
// test/order.mjs runs every operation with no browser.
//
// The order keeps its own rule, that no two groups share a name, ignoring case: it refuses a
// rename to a name another group has (renameGroup()), and a group that comes into it under one
// gets the next free one in brackets (addGroup(), addEntries()).
import { freeName, nameTaken } from './group.ts';
import type { StoredGroup } from './group.ts';
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

// What became of a rename (renameGroup()): the group has the name now ('renamed'), or had it
// already ('same'); the order refused the name, as there's nothing of it ('empty') or another
// group has it ('taken'); or the group isn't in the order ('gone').
export type Renamed = 'renamed' | 'same' | 'empty' | 'taken' | 'gone';

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

// Every rule in the order from the top, which is the order the page tries them in.
export function rulesIn(order: Entry[]): Rule[] {
  return order.flatMap((entry) => (entry.kind === 'rule' ? [entry.rule] : entry.rules));
}

// Every group in the order, from the top.
export function groupsIn(order: Entry[]): Group[] {
  return order.flatMap((entry) => (entry.kind === 'group' ? [entry.group] : []));
}

// The groups as they're kept, each with its place among the top-level entries: in storage, and in
// an exported file.
export function storedGroups(order: Entry[]): StoredGroup[] {
  return order.flatMap((entry, at) =>
    entry.kind === 'group' ? [{ ...entry.group, at }] : [],
  );
}

// Where a group stands among the top-level entries, or -1.
export function groupIndex(order: Entry[], id: string) {
  return order.findIndex((entry) => entry.kind === 'group' && entry.group.id === id);
}

function blockOf(order: Entry[], id: string) {
  const entry = order[groupIndex(order, id)];
  return entry?.kind === 'group' ? entry : undefined;
}

// Where a rule is: its group and its index there, or '' and its index among the top-level entries.
export function placeOf(order: Entry[], id: string): Place | null {
  for (const [at, entry] of order.entries()) {
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
export function placeAt(order: Entry[], position: number, group = ''): Place {
  const block = group ? blockOf(order, group) : undefined;
  let before = 0;
  for (const [at, entry] of order.entries()) {
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
  return { group: '', index: order.length };
}

function clamp(value: number, max: number) {
  return Math.min(Math.max(Math.trunc(value) || 0, 0), max);
}

// Puts rules at a place, each told which group it's in now. A group that isn't there (deleted
// meanwhile) puts them at the top, ungrouped.
export function put(order: Entry[], rules: Rule[], place: Place) {
  const block = place.group ? blockOf(order, place.group) : undefined;
  if (block) {
    for (const rule of rules) rule.group = block.group.id;
    block.rules.splice(clamp(place.index, block.rules.length), 0, ...rules);
    return;
  }
  for (const rule of rules) rule.group = '';
  order.splice(
    place.group ? 0 : clamp(place.index, order.length),
    0,
    ...rules.map((rule): RuleEntry => ({ kind: 'rule', rule })),
  );
}

// Takes a rule out of the order, and says where it was; null if it isn't there.
export function take(order: Entry[], id: string) {
  const place = placeOf(order, id);
  if (!place) return null;
  const rule = place.group
    ? blockOf(order, place.group)!.rules.splice(place.index, 1)[0]!
    : (order.splice(place.index, 1)[0] as RuleEntry).rule;
  return { rule, place };
}

// Moves a rule to a place given as the order stands with the rule still in it, as a drag sees
// it: before what's at that index now. Says whether the rule was there to move.
export function moveRule(order: Entry[], id: string, place: Place) {
  const from = placeOf(order, id);
  if (!from) return false;
  const { rule } = take(order, id)!;
  const index =
    from.group === place.group && from.index < place.index
      ? place.index - 1
      : place.index;
  put(order, [rule], { group: place.group, index });
  return true;
}

// Moves a rule to be tried `position`th once it's there (0 is first), in a group (its id) or none
// (''), or in its own if none is given: as near to that as the group's block allows (placeAt()).
// What the agent's position means. Says whether the rule was there to move.
export function moveRuleTo(order: Entry[], id: string, position: number, group?: string) {
  const taken = take(order, id);
  if (!taken) return false;
  put(order, [taken.rule], placeAt(order, position, group ?? taken.place.group));
  return true;
}

// Moves a group to `index` among the top-level entries, given as the order stands with the group
// still in it: before what's at that index now. Says whether the group was there to move.
export function moveGroup(order: Entry[], id: string, index: number) {
  const from = groupIndex(order, id);
  if (from === -1) return false;
  const [entry] = order.splice(from, 1);
  order.splice(clamp(from < index ? index - 1 : index, order.length), 0, entry!);
  return true;
}

// Moves a group to `index` among the top-level entries once it's there (0 is the top). Says
// whether the group was there to move.
export function moveGroupTo(order: Entry[], id: string, index: number) {
  const from = groupIndex(order, id);
  if (from === -1) return false;
  const [entry] = order.splice(from, 1);
  order.splice(clamp(index, order.length), 0, entry!);
  return true;
}

// Entries from a rules file, at the top, in the file's order. A group among them whose name a
// group has, in the order or before it in the file, gets the next free one in brackets.
export function addEntries(order: Entry[], entries: Entry[]) {
  const taken = groupsIn(order);
  for (const entry of entries) {
    if (entry.kind === 'rule') continue;
    entry.group.name = freeName(entry.group.name, taken, 'brackets');
    taken.push(entry.group);
  }
  order.unshift(...entries);
}

// A group, at `index` among the top-level entries, with the rules given in it: a copy's, a
// deleted group's back with it, or none yet. Under a name another group has, it gets the next
// free one in brackets.
export function addGroup(order: Entry[], group: Group, index = 0, rules: Rule[] = []) {
  group.name = freeName(group.name, groupsIn(order), 'brackets');
  for (const rule of rules) rule.group = group.id;
  order.splice(clamp(index, order.length), 0, { kind: 'group', group, rules });
  return group;
}

// Deletes a group and its rules, and says where it was, for Undo (addGroup()); null if it isn't
// there.
export function removeGroup(order: Entry[], id: string) {
  const index = groupIndex(order, id);
  if (index === -1) return null;
  const entry = order.splice(index, 1)[0] as GroupEntry;
  return { group: entry.group, rules: entry.rules, index };
}

// Takes a group away and leaves its rules where it was, ungrouped. Says whether the group was
// there.
export function ungroup(order: Entry[], id: string) {
  const index = groupIndex(order, id);
  if (index === -1) return false;
  const entry = order[index] as GroupEntry;
  for (const rule of entry.rules) rule.group = '';
  order.splice(
    index,
    1,
    ...entry.rules.map((rule): RuleEntry => ({ kind: 'rule', rule })),
  );
  return true;
}

// Renames a group, to the name as it's given. The order refuses a name with nothing in it, and
// one another group has, ignoring case; what it returns says which, for whoever asked to say in
// their own words. The group's own name in another case is a new name for it.
export function renameGroup(order: Entry[], id: string, name: string): Renamed {
  if (!name.trim()) return 'empty';
  const groups = groupsIn(order);
  const group = groups.find((each) => each.id === id);
  if (group?.name === name) return 'same';
  if (nameTaken(name, groups, id)) return 'taken';
  if (!group) return 'gone';
  group.name = name;
  group.updatedAt = Date.now();
  return 'renamed';
}

// Turns a group on or off. Its rules keep their own switches as they are, for when it's on
// again: they answer only while it's on as well as they. Says whether the group was there.
export function turnGroup(order: Entry[], id: string, on: boolean) {
  const group = blockOf(order, id)?.group;
  if (!group) return false;
  group.enabled = on;
  group.updatedAt = Date.now();
  return true;
}
