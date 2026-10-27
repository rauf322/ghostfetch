// The toolbar badge: how many rules are on, or "off" while Ghostfetch is.
import type { Rule } from '../../entities/rule/index.ts';

export function updateBadge(enabled: boolean, rules: Rule[]) {
  const count = rules.filter((rule) => rule.enabled).length;
  chrome.action.setBadgeBackgroundColor({ color: enabled ? '#7c3aed' : '#6b7280' });
  chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  chrome.action.setBadgeText({ text: !enabled ? 'off' : count ? String(count) : '' });
}
