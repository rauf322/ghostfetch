// The file picker behind "Import rules…", hidden: the menus and buttons that import click it
// through `ref`.
import type { Ref } from 'react';
import type { Rule } from '../../../entities/rule/index.ts';
import { importRules } from '../model/import-rules.ts';

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
