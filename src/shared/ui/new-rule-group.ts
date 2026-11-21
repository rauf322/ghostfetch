// The group a new rule goes into to start with, where New rule and Mock this response make one: the
// group the last rule made there went into (its id, kept in this browser), if it's still there and
// on. Otherwise none, so a new rule answers as soon as it's made.
import { findGroup } from '../../rules/index.ts';

const KEY = 'ghostfetch.newRuleGroup';

export function lastRuleGroup() {
  const id = localStorage.getItem(KEY) ?? '';
  return findGroup(id)?.enabled ? id : '';
}

// None is kept as nothing kept: until there's a group, nothing of this is in the browser.
export function rememberRuleGroup(id: string) {
  if (id) localStorage.setItem(KEY, id);
  else localStorage.removeItem(KEY);
}
