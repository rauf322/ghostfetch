// What the search shows of the order: the rules whose name, URL pattern or GraphQL operation has
// the query in it, ignoring case, each group with those of its rules (all of them, if the group's
// name has the query in it), and no group that has neither.
import { ruleTitle } from './rule.ts';
import type { Entry } from './order.ts';
import type { Rule } from './types.ts';

function has(rule: Rule, term: string) {
  return [ruleTitle(rule), rule.match.url, rule.match.graphqlOperation]
    .join(' ')
    .toLowerCase()
    .includes(term);
}

export function filterEntries(entries: Entry[], query: string): Entry[] {
  const term = query.trim().toLowerCase();
  if (!term) return entries;
  return entries.flatMap((entry): Entry[] => {
    if (entry.kind === 'rule') return has(entry.rule, term) ? [entry] : [];
    if (entry.group.name.toLowerCase().includes(term)) return [entry];
    const rules = entry.rules.filter((rule) => has(rule, term));
    return rules.length ? [{ ...entry, rules }] : [];
  });
}
