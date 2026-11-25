// The bar across the top of a rule: back to the sidebar (in a narrow panel), where you are (beside
// the sidebar: its group's crumb and its name's, which are controls, rule-crumbs.tsx), Duplicate
// (where there's room for the word) and its ⋯ menu, which its name's crumb opens too: one menu
// (rule-menu.tsx). The rule's switch is its dot in the list and in the popup, and Ghostfetch's own
// switch is the popup's.
import { useState } from 'react';
import { groupOf, ruleTitle } from '../../index.ts';
import type { Rule } from '../../index.ts';
import { duplicateRule } from '../../application/duplicate-rule.ts';
import { Button } from '../../../../ui/kit/button.tsx';
import { createMenuHandle } from '../../../../ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../../ui/kit/icon.tsx';
import { RulesHead } from '../rules-head.tsx';
import { RuleCrumbs } from './rule-crumbs.tsx';
import { RuleMenu, RuleMenuButton } from './rule-menu.tsx';
import type { RuleMenuFrom } from './rule-menu.tsx';

export function RuleHeader({
  rule,
  onSelect,
  onNewRule,
}: {
  rule: Rule;
  onSelect: (id: string | null) => void;
  // New rule, in a group ('' for none): the group's crumb's.
  onNewRule: (group: string) => void;
}) {
  const [menu] = useState(createMenuHandle<RuleMenuFrom>);
  return (
    <RulesHead
      title={ruleTitle(rule)}
      crumbs={
        <RuleCrumbs rule={rule} group={groupOf(rule)} menu={menu} onNewRule={onNewRule} />
      }
      backTestId="rule-back"
      onBack={() => onSelect(null)}
    >
      <Button
        data-testid="duplicate-rule"
        onClick={() => onSelect(duplicateRule(rule))}
        className="hidden @[640px]/main:inline-flex"
      >
        <Icon name="copy" size={14} />
        Duplicate
      </Button>
      <RuleMenuButton handle={menu} />
      <RuleMenu handle={menu} rule={rule} onSelect={onSelect} />
    </RulesHead>
  );
}
