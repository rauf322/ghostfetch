// Rules files: every rule, or one, as the JSON that importRules() reads back.
import { ruleStore, ruleTitle } from '../../../entities/rule/index.ts';
import type { Rule } from '../../../entities/rule/index.ts';
import { download } from '../../../shared/lib/browser/index.ts';
import { notify } from '../../../shared/ui/kit/toast.tsx';
import { slug } from '../lib/slug.ts';

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
