// The rules the search shows: those whose name, URL pattern, GraphQL operation or type has the
// query in it, ignoring case.
import { TYPES, ruleTitle } from '../../../shared/api/index.ts';
import type { Rule } from '../../../shared/api/index.ts';

export function filterRules(rules: Rule[], query: string) {
  const term = query.trim().toLowerCase();
  return rules.filter(
    (rule) =>
      !term ||
      [
        ruleTitle(rule),
        rule.match.url,
        rule.match.graphqlOperation,
        TYPES[rule.type].label,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term),
  );
}
