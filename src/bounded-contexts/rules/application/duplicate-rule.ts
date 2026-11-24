// A copy of a rule, named "… (copy)", right after it in the list (in its group, if it's in one), its
// body compared with the same server's response. Returns the copy's id.
import { addRule, placeOf } from './store.ts';
import { copyServerResponse } from './server-responses.ts';
import { normalizeRule, ruleTitle } from '../domain/rule.ts';
import type { Rule } from '../domain/types.ts';

export function duplicateRule(rule: Rule) {
  const copy = normalizeRule(structuredClone(rule), { newId: true });
  copy.name = `${ruleTitle(rule)} (copy)`;
  const place = placeOf(rule.id) ?? { group: '', index: -1 };
  addRule(copy, { group: place.group, index: place.index + 1 });
  copyServerResponse(rule.id, copy.id);
  return copy.id;
}
