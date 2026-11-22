// What the page is given: the state the bridge (src/app/bridge/index.ts) posts to the interceptor
// (PageState, ../contract.ts), made from what it read of storage: the rules that answer, each as
// the editor reads it, in their order, with the two switches. A function of what was read, with
// no browser in it: reading storage and posting are the bridge's, which calls this in between,
// with nothing awaited.
import { wouldAnswer } from '../domain/answering.ts';
import { normalizeGroups } from '../domain/group.ts';
import { layOut } from '../domain/order.ts';
import { isResponseRule, normalizeRule } from '../domain/rule.ts';
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
  // Each stored rule rebuilt as the editor reads it (normalizeRule, which keeps its id, or makes
  // one if it has no valid one) before anything is asked of it: so the page does what the editor
  // shows, and the editor's next save, which writes the rules rebuilt, changes nothing on the
  // page. Left out first: a redirect, header or block rule from before 0.9.0, which the editor
  // leaves out too, and what isn't a rule at all (null, text, a number, a list), which the editor
  // reads as an empty rule that matches nothing.
  const kept = Array.isArray(stored.rules)
    ? stored.rules
        .filter(
          (rule) =>
            rule &&
            typeof rule === 'object' &&
            !Array.isArray(rule) &&
            isResponseRule(rule),
        )
        .map((rule) => normalizeRule(rule))
    : [];
  const ordered = layOut(kept, groups).flatMap((entry) =>
    entry.kind === 'rule' ? [entry.rule] : entry.rules,
  );
  return {
    type: 'state',
    enabled: stored.enabled,
    record: stored.record,
    // The ones on, in no group or a group that's on, each in a group with the group's name, for
    // the traffic log.
    rules: ordered
      .filter((rule) => wouldAnswer(rule, !off.has(rule.group)))
      .map((rule) =>
        names.has(rule.group) ? { ...rule, groupName: names.get(rule.group) } : rule,
      ),
  } satisfies PageState;
}
