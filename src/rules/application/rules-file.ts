// Rules files: every rule with the groups, one group with its rules, or one rule, written as JSON
// under the name it's saved as; and a rules file's text read into the order. No React and no page:
// the download, the hidden file picker behind "Import rules…" and the toasts that say how an
// import went are the screens' (ui/rules-file.tsx).
//
// A file has the rules as they're kept, each saying which group it's in, and the groups as they're
// kept, each with its place among the order's top-level entries (`ghostfetch: 2`; files from before
// groups say 1 and have no groups). An older Ghostfetch, which reads only the rules, brings them all
// in ungrouped, turned off as every import is.
import { addEntries, ruleStore, storedGroups } from './store.ts';
import { freeName, normalizeGroups } from '../domain/group.ts';
import { layOut } from '../domain/order.ts';
import type { GroupEntry } from '../domain/order.ts';
import { normalizeRules, ruleTitle } from '../domain/rule.ts';
import type { Group, Rule } from '../domain/types.ts';
import { slug } from '../../lib/index.ts';

const FORMAT = 2;

// Every rule with the groups; null while there's neither.
export function allRulesFile() {
  const { rules, groups } = ruleStore.state;
  if (!rules.length && !groups.length) return null;
  const date = new Date().toISOString().slice(0, 10);
  return {
    name: `ghostfetch-rules-${date}.json`,
    text: JSON.stringify(
      {
        ghostfetch: FORMAT,
        exportedAt: new Date().toISOString(),
        rules,
        groups: storedGroups(),
      },
      null,
      2,
    ),
  };
}

// A group and its rules, to hand a PR's mocks to someone else: they come in as the group, turned
// off.
export function groupFile(group: Group) {
  const entry = ruleStore.state.entries.find(
    (each): each is GroupEntry => each.kind === 'group' && each.group.id === group.id,
  );
  return {
    name: `ghostfetch-${slug(group.name)}.json`,
    text: JSON.stringify(
      {
        ghostfetch: FORMAT,
        exportedAt: new Date().toISOString(),
        rules: entry?.rules ?? [],
        groups: [{ ...group, at: 0 }],
      },
      null,
      2,
    ),
  };
}

export function ruleFile(rule: Rule) {
  return {
    name: `ghostfetch-${slug(ruleTitle(rule))}.json`,
    text: JSON.stringify(
      { ghostfetch: FORMAT, rules: [{ ...rule, group: '' }] },
      null,
      2,
    ),
  };
}

// Adds what a rules file has (an export, or a plain list of rules) at the top of the list, in the
// file's order, each rule rebuilt from what it says. A rule changes what your app gets back from
// its server, so someone else's rules wait until you've read them: each group comes in turned off,
// its rules' own switches as the file has them, so its dot then turns on just what the sender had
// on; and each ungrouped rule comes in turned off itself. Every rule and group gets an id of its
// own, and a group whose name is taken here a number ("PR-1 (2)"). A redirect, header or block rule
// (from before 0.9.0) is skipped. Returns the rules and groups it added, and how many rules it
// skipped; throws, saying why, for a file that isn't JSON or has nothing Ghostfetch can import.
export function importRulesFile(text: string) {
  const data = JSON.parse(text);
  const incoming = Array.isArray(data) ? data : data?.rules;
  const groups = normalizeGroups(Array.isArray(data) ? [] : data?.groups);
  if (!Array.isArray(incoming) || (!incoming.length && !groups.length))
    throw new Error('no rules found in this file');
  const rules = normalizeRules(incoming, { newId: true });
  if (!rules.length && !groups.length)
    throw new Error(
      "it only has redirect, header or block rules, which Ghostfetch doesn't have any more",
    );
  const taken = [...ruleStore.state.groups];
  const ids = new Map<string, string>();
  for (const group of groups) {
    const id = crypto.randomUUID();
    ids.set(group.id, id);
    group.id = id;
    group.enabled = false;
    group.name = freeName(group.name, taken, 'brackets');
    taken.push(group);
  }
  for (const rule of rules) {
    rule.group = ids.get(rule.group) ?? '';
    if (!rule.group) rule.enabled = false;
  }
  addEntries(layOut(rules, groups));
  return { rules, groups, skipped: incoming.length - rules.length };
}
