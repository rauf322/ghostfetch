// Rules files: every rule with the groups, one group with its rules, or one rule, saved as JSON;
// and a rules file read back in through the hidden file picker behind "Import rules…", with a
// toast that says how it went. What a file is, writing one and reading one into the order are
// application/rules-file.ts's; this is the download, the file picker and the toasts.
import type { Ref } from 'react';
import type { Group, Rule } from '../index.ts';
import {
  allRulesFile,
  groupFile,
  importRulesFile,
  ruleFile,
} from '../application/rules-file.ts';
import { download } from '../../../lib/index.ts';
import { notify } from '../../../ui/kit/toast.tsx';

// A message as a sentence: capitalised, with a full stop.
const sentence = (text: string) =>
  `${text[0].toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? '' : '.'}`;

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

export function exportRules() {
  const file = allRulesFile();
  if (!file) return notify('No rules to export yet');
  download(file.name, file.text);
  return undefined;
}

export function exportGroup(group: Group) {
  const file = groupFile(group);
  download(file.name, file.text);
}

export function exportRule(rule: Rule) {
  const file = ruleFile(rule);
  download(file.name, file.text);
}

// A rules file the picker was given, into the order (importRulesFile): its rules and groups arrive
// turned off. `onAdded` gets the rules once they're in; a toast says how it went, or why the file
// couldn't be imported.
async function importRules(file: File, onAdded: (rules: Rule[]) => void) {
  try {
    const { rules, groups, skipped } = importRulesFile(await file.text());
    onAdded(rules);
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
