// Adds the rules in a rules file (an export, or a plain list of rules), each rebuilt from what it
// says and switched off: a rule can run a script inside your app or redirect its requests
// elsewhere, so a rules file is effectively code, and its rules wait until you've read them.
// `onAdded` gets the rules once they're in; a toast says how it went.
import { addRules, normalizeRule } from '../../../entities/rule/index.ts';
import type { Rule } from '../../../entities/rule/index.ts';
import { notify } from '../../../shared/ui/kit/toast.tsx';

export async function importRules(file: File, onAdded: (rules: Rule[]) => void) {
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data?.rules;
    if (!Array.isArray(incoming) || !incoming.length)
      throw new Error('no rules found in this file');
    const imported = incoming.map((rule: unknown) => ({
      ...normalizeRule(rule, { newId: true }),
      enabled: false,
    }));
    addRules(imported);
    onAdded(imported);
    notify(
      `Imported ${imported.length} rule${imported.length === 1 ? '' : 's'}, switched off. Review them before turning them on: rules can run scripts and redirect requests.`,
      { duration: 7000 },
    );
  } catch (error) {
    notify(`Couldn't import: ${(error as Error).message}`, {
      kind: 'error',
      duration: 5000,
    });
  }
}
