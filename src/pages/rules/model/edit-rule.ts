// A change to a rule goes to the stored rule, looked up by its id: an edit made in another view
// replaces every rule with a new copy. Each change is saved as it's made (touchRule) and applies
// to open tabs right away.
import { findRule, touchRule } from '../../../shared/api/index.ts';
import type { Rule } from '../../../shared/api/index.ts';

export function editRule(id: string, change: (rule: Rule) => void) {
  const current = findRule(id);
  if (!current) return;
  change(current);
  touchRule(current);
}
