// Rules files: every rule with the groups, one group with its rules, or one rule, saved as JSON;
// and a rules file read back in through the hidden file picker behind "Import rules…".
//
// A file has the rules as they're kept, each saying which group it's in, and the groups as they're
// kept, each with its place among the order's top-level entries (`ghostfetch: 2`; files from before
// groups say 1 and have no groups). An older Ghostfetch, which reads only the rules, brings them all
// in ungrouped, turned off as every import is.
import type { Ref } from 'react';
import {
  addEntries,
  freeName,
  layOut,
  normalizeGroups,
  normalizeRules,
  ruleStore,
  ruleTitle,
  storedGroups,
} from '../api/index.ts';
import type { Group, GroupEntry, Rule } from '../api/index.ts';
import { download, slug } from '../../lib/index.ts';
import { notify } from '../../ui/kit/toast.tsx';

const FORMAT = 2;

// A message as a sentence: capitalised, with a full stop.
const sentence = (text: string) =>
  `${text[0].toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? '' : '.'}`;

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

export function exportRules() {
  const { rules, groups } = ruleStore.state;
  if (!rules.length && !groups.length) return notify('No rules to export yet');
  const date = new Date().toISOString().slice(0, 10);
  download(
    `ghostfetch-rules-${date}.json`,
    JSON.stringify(
      {
        ghostfetch: FORMAT,
        exportedAt: new Date().toISOString(),
        rules,
        groups: storedGroups(),
      },
      null,
      2,
    ),
  );
  return undefined;
}

// A group and its rules, to hand a PR's mocks to someone else: they come in as the group, turned
// off.
export function exportGroup(group: Group) {
  const entry = ruleStore.state.entries.find(
    (each): each is GroupEntry => each.kind === 'group' && each.group.id === group.id,
  );
  download(
    `ghostfetch-${slug(group.name)}.json`,
    JSON.stringify(
      {
        ghostfetch: FORMAT,
        exportedAt: new Date().toISOString(),
        rules: entry?.rules ?? [],
        groups: [{ ...group, at: 0 }],
      },
      null,
      2,
    ),
  );
}

export function exportRule(rule: Rule) {
  download(
    `ghostfetch-${slug(ruleTitle(rule))}.json`,
    JSON.stringify({ ghostfetch: FORMAT, rules: [{ ...rule, group: '' }] }, null, 2),
  );
}

// Adds what a rules file has (an export, or a plain list of rules) at the top of the list, in the
// file's order, each rule rebuilt from what it says. A rule changes what your app gets back from
// its server, so someone else's rules wait until you've read them: each group comes in turned off,
// its rules' own switches as the file has them, so its dot then turns on just what the sender had
// on; and each ungrouped rule comes in turned off itself. Every rule and group gets an id of its
// own, and a group whose name is taken here a number ("PR-1 (2)"). A redirect, header or block rule
// (from before 0.9.0) is skipped. `onAdded` gets the rules once they're in; a toast says how it
// went.
async function importRules(file: File, onAdded: (rules: Rule[]) => void) {
  try {
    const data = JSON.parse(await file.text());
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
    onAdded(rules);
    const skipped = incoming.length - rules.length;
    const skippedNote = skipped
      ? ` ${skipped} redirect, header or block rule${skipped === 1 ? ' was' : 's were'} skipped: Ghostfetch doesn't have those any more.`
      : '';
    // "Imported 5 rules and the group “PR-1”", "Imported the group “PR-1”", "Imported 3 rules".
    const what = [
      ...(rules.length || !groups.length ? [plural(rules.length, 'rule')] : []),
      ...(groups.length
        ? [
            groups.length === 1
              ? `the group “${groups[0]!.name}”`
              : plural(groups.length, 'group'),
          ]
        : []),
    ].join(' and ');
    const others = rules.some((rule) => !rule.group);
    const review = groups.length
      ? `Review them, then turn ${groups.length === 1 ? 'the group' : 'each group'} on with its dot${others ? ', and the other rules with theirs' : ''}.`
      : 'Review them, then turn them on with their dots.';
    notify(`Imported ${what}, turned off`, {
      kind: 'success',
      description: `${review}${skippedNote}`,
      duration: 7000,
    });
  } catch (error) {
    notify("Couldn't import", {
      kind: 'error',
      description: sentence((error as Error).message),
    });
  }
}

// The file picker behind "Import rules…", hidden: the menus and buttons that import click it
// through `ref`.
export function ImportRulesInput({
  ref,
  onImported,
}: {
  ref: Ref<HTMLInputElement>;
  // The rules a file added (none, for a file of one empty group), to open the first one.
  onImported: (rules: Rule[]) => void;
}) {
  return (
    <input
      type="file"
      ref={ref}
      data-testid="import-file"
      accept=".json,application/json"
      hidden
      onChange={(event) => {
        const [file] = event.target.files!;
        event.target.value = '';
        if (file) importRules(file, onImported);
      }}
    />
  );
}
