// What a rule in the list says it does, after its type: where it redirects, how many headers it
// sets, or its body mode, status and delay.
import { BODY_MODES } from '../../../entities/rule/index.ts';
import type { Rule } from '../../../entities/rule/index.ts';

export function ruleSummary(rule: Rule) {
  if (rule.type === 'redirect') return `→ ${rule.redirect.to || 'no destination yet'}`;
  if (rule.type === 'block') return 'Requests fail';
  if (rule.type === 'headers') {
    const count = rule.headers.request.length + rule.headers.response.length;
    return `${count} header${count === 1 ? '' : 's'}`;
  }
  const { bodyMode, status, delay } = rule.response;
  return [BODY_MODES[bodyMode].label, status, delay ? `${delay} ms` : '']
    .filter(Boolean)
    .join(' · ');
}
