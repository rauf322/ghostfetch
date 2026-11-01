// Rules files: every rule, or one, saved as JSON, and a rules file read back in through the hidden
// file picker behind "Import rules…".
import type { Ref } from 'react';
import { addRules, normalizeRules, ruleStore, ruleTitle } from '../api/index.ts';
import type { Rule } from '../api/index.ts';
import { download, slug } from '../lib/index.ts';
import { notify } from './kit/toast.tsx';

export function exportRules() {
  if (!ruleStore.state.rules.length) return notify('There are no rules to export yet');
  const date = new Date().toISOString().slice(0, 10);
  download(
    `ghostfetch-rules-${date}.json`,
    JSON.stringify(
      {
        ghostfetch: 1,
        exportedAt: new Date().toISOString(),
        rules: ruleStore.state.rules,
      },
      null,
      2,
    ),
  );
  return undefined;
}

export function exportRule(rule: Rule) {
  download(
    `ghostfetch-${slug(ruleTitle(rule))}.json`,
    JSON.stringify({ ghostfetch: 1, rules: [rule] }, null, 2),
  );
}

// Adds the rules in a rules file (an export, or a plain list of rules), each rebuilt from what it
// says and switched off: a rule changes what your app gets back from its server, so the rules in
// someone else's file wait until you've read them. A redirect, header or block rule (from before
// 0.9.0) is skipped. `onAdded` gets the rules once they're in; a toast says how it went.
async function importRules(file: File, onAdded: (rules: Rule[]) => void) {
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data?.rules;
    if (!Array.isArray(incoming) || !incoming.length)
      throw new Error('no rules found in this file');
    const imported = normalizeRules(incoming, { newId: true }).map((rule) => ({
      ...rule,
      enabled: false,
    }));
    if (!imported.length)
      throw new Error(
        "it only has redirect, header or block rules, which Ghostfetch doesn't have any more",
      );
    const skipped = incoming.length - imported.length;
    const skippedNote = skipped
      ? ` ${skipped} redirect, header or block rule${skipped === 1 ? ' was' : 's were'} skipped: Ghostfetch doesn't have those any more.`
      : '';
    addRules(imported);
    onAdded(imported);
    notify(
      `Imported ${imported.length} rule${imported.length === 1 ? '' : 's'}, switched off. Review them before turning them on.${skippedNote}`,
      { duration: 7000 },
    );
  } catch (error) {
    notify(`Couldn't import: ${(error as Error).message}`, {
      kind: 'error',
      duration: 5000,
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
  // The rules a file added, to open the first one.
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
