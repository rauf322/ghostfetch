// A rule as it's stored, edited and sent to the page. Every rule answers the page's fetch() and
// XMLHttpRequest calls that it matches. Up to 0.8 a rule also had a type: redirect, header and
// block rules, which 0.9.0 took out, are left out when the rules are read (normalizeRules). What
// its match and its answer are made of is the shared kernel's (src/shared-kernel/rule-parts.ts),
// which the page reads them by too.
import type { RuleMatch, RuleResponse } from '../../../shared-kernel/index.ts';

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  // The group the rule is in, by its id, or '' for none (an ungrouped rule).
  group: string;
  match: RuleMatch;
  response: RuleResponse;
  createdAt: number;
  updatedAt: number;
}

// A group of rules (docs/glossary/rules.md): a name no other group has, and a switch of its own.
// Its rules stand together in the order, in its place, and answer only while it's on as well as
// they; turned off, it leaves their own switches as they were. One level only: a group holds
// rules, never another group. Where it stands in the order is kept with the rules
// (infrastructure/order-storage.ts).
export interface Group {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
