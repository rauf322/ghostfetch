// A rule's switch in the popup. Saved at once rather than after the editor's short pause: the
// popup can close at any moment.
import { findRule, touchRule } from '../../../shared/api/index.ts';

export function switchRule(id: string, on: boolean) {
  const rule = findRule(id);
  if (!rule) return;
  rule.enabled = on;
  touchRule(rule, { immediate: true });
}
