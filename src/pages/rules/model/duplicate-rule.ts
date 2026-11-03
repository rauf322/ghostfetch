// A copy of a rule, named "… (copy)", right after it in the list. Returns the copy's id.
import {
  addRule,
  normalizeRule,
  ruleStore,
  ruleTitle,
} from '../../../shared/api/index.ts';
import type { Rule } from '../../../shared/api/index.ts';

export function duplicateRule(rule: Rule) {
  const copy = normalizeRule(structuredClone(rule), { newId: true });
  copy.name = `${ruleTitle(rule)} (copy)`;
  addRule(copy, ruleStore.state.rules.indexOf(rule) + 1);
  return copy.id;
}
