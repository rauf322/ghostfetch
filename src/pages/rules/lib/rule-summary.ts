// What a rule in the list says it does: its body mode, status and delay.
import { BODY_MODES } from '../../../shared/api/index.ts';
import type { Rule } from '../../../shared/api/index.ts';

export function ruleSummary(rule: Rule) {
  const { bodyMode, status, delay } = rule.response;
  return [BODY_MODES[bodyMode].label, status, delay ? formatDelay(delay) : '']
    .filter(Boolean)
    .join(' · ');
}

// A delay as the list and the Delay tab show it: "600 ms" under a second, "1 s" or "1.5 s" from
// there on.
export function formatDelay(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${Number((ms / 1000).toFixed(2))} s`;
}
