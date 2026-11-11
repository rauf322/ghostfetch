// The toolbar badge: how many rules are on, in Ghostfetch's green (its one colour, which means
// "on") with near-black text, which reads on it where white wouldn't; or "off" in grey while
// Ghostfetch is.
import type { Rule } from '../../shared/api/index.ts';

const GREEN = '#34d399';
const INK = '#0b0b0c';
const GREY = '#6b7280';

export function updateBadge(enabled: boolean, rules: Rule[]) {
  const count = rules.filter((rule) => rule.enabled).length;
  chrome.action.setBadgeBackgroundColor({ color: enabled ? GREEN : GREY });
  chrome.action.setBadgeTextColor?.({ color: enabled ? INK : '#ffffff' });
  chrome.action.setBadgeText({ text: !enabled ? 'off' : count ? String(count) : '' });
}
