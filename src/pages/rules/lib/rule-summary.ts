// What a rule in the list says it does, after its type: where it redirects, how many headers it
// sets, or its body mode, status and delay.
import { BODY_MODES } from '../../../shared/api/index.ts';
import type { Rule } from '../../../shared/api/index.ts';

export function ruleSummary(rule: Rule) {
  if (rule.type === 'redirect') return `→ ${rule.redirect.to || 'no destination yet'}`;
  if (rule.type === 'block') return 'Requests fail';
  if (rule.type === 'headers') {
    const count = rule.headers.request.length + rule.headers.response.length;
    return `${count} header${count === 1 ? '' : 's'}`;
  }
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
