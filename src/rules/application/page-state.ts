// What the page is given: the state the bridge (src/app/bridge/index.ts) posts to the interceptor
// (PageState, ../contract.ts), made from what it read of storage: the rules that answer, in their
// order, with the two switches. A function of what was read, with no browser in it: reading
// storage and posting are the bridge's, which calls this in between, with nothing awaited.
import { wouldAnswer } from '../domain/answering.ts';
import { normalizeGroups } from '../domain/group.ts';
import { layOut } from '../domain/order.ts';
import { isResponseRule } from '../domain/rule.ts';
import type { Rule } from '../domain/types.ts';
import type { PageState } from '../contract.ts';

// `stored` is what the bridge read: the two switches, and the rules and groups as they're stored,
// which can't be trusted.
export function pageState(stored: {
  enabled: boolean;
  record: boolean;
  rules: unknown;
  groups: unknown;
}) {
  // The groups as the editor has them, and the rules in the order it shows (domain/order.ts):
  // each group's rules together, in the group's place.
  const groups = normalizeGroups(stored.groups);
  const names = new Map(groups.map((group) => [group.id, group.name]));
  const off = new Set(groups.filter((group) => !group.enabled).map((group) => group.id));
  const kept = Array.isArray(stored.rules)
    ? (stored.rules.filter(
        (rule) => rule && typeof rule === 'object' && isResponseRule(rule),
      ) as Rule[])
    : [];
  const ordered = layOut(kept, groups).flatMap((entry) =>
    entry.kind === 'rule' ? [entry.rule] : entry.rules,
  );
  return {
    type: 'state',
    enabled: stored.enabled,
    record: stored.record,
    // As they're stored but for their order, which can still include a redirect, header or
    // block rule from before 0.9.0 until the rules are next saved: the ones on, in no group
    // or a group that's on, each in a group with the group's name, for the traffic log.
    rules: ordered
      .filter((rule) => wouldAnswer(rule, !off.has(rule.group)))
      .map((rule) =>
        names.has(rule.group) ? { ...rule, groupName: names.get(rule.group) } : rule,
      ),
  } satisfies PageState;
}
