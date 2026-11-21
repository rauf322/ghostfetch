// The toolbar badge: how many rules are answering (on, and in no group or a group that's on), in
// Ghostfetch's green (its one colour, which means "on") with near-black text, which reads on it
// where white wouldn't; or "off" in grey while Ghostfetch is paused.
import { isAnswering } from '../../shared/api/index.ts';
import type { Rule } from '../../shared/api/index.ts';

const GREEN = '#34d399';
const INK = '#0b0b0c';
const GREY = '#6b7280';

export function updateBadge(enabled: boolean, rules: Rule[], off: Set<string>) {
  const count = rules.filter((rule) =>
    isAnswering(rule, !off.has(rule.group), !enabled),
  ).length;
  chrome.action.setBadgeBackgroundColor({ color: enabled ? GREEN : GREY });
  chrome.action.setBadgeTextColor?.({ color: enabled ? INK : '#ffffff' });
  chrome.action.setBadgeText({ text: !enabled ? 'off' : count ? String(count) : '' });
}
