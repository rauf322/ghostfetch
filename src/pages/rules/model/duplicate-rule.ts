// A copy of a rule, named "… (copy)", right after it in the list, its body compared with the same
// server's response. Returns the copy's id.
import {
  addRule,
  copyServerResponse,
  normalizeRule,
  ruleStore,
  ruleTitle,
} from '../../../shared/api/index.ts';
import type { Rule } from '../../../shared/api/index.ts';

export function duplicateRule(rule: Rule) {
  const copy = normalizeRule(structuredClone(rule), { newId: true });
  copy.name = `${ruleTitle(rule)} (copy)`;
  addRule(copy, ruleStore.state.rules.indexOf(rule) + 1);
  copyServerResponse(rule.id, copy.id);
  return copy.id;
}
