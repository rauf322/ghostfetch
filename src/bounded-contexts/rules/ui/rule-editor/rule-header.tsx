// The bar across the top of a rule: back to the sidebar (in a narrow panel), where you are (beside
// the sidebar: its group's crumb and its name's, which are controls, rule-crumbs.tsx), Duplicate,
// as an icon beside the ⋯, wide and in a narrow panel alike, and its ⋯ menu, which its name's crumb
// opens too: one menu (rule-menu.tsx). The rule's switch is its dot in the list and in the popup,
// and Ghostfetch's own switch is the popup's.
//
// Rename in that menu renames the rule in its name's crumb, as a double-click on the crumb or F2
// does; in a narrow panel, which has no crumbs, in the name over the rule (`nameField`, its name
// selected to type over).
import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import { groupOf, ruleTitle } from '../../index.ts';
import type { Rule } from '../../index.ts';
import { duplicateRule } from '../../application/duplicate-rule.ts';
import { Button } from '../../../../ui/kit/button.tsx';
import { createMenuHandle } from '../../../../ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../../ui/kit/icon.tsx';
import { Tooltip } from '../../../../ui/kit/tooltip.tsx';
import { RulesHead } from '../rules-head.tsx';
import { RuleCrumbs } from './rule-crumbs.tsx';
import { RuleMenu, RuleMenuButton } from './rule-menu.tsx';
import type { RuleMenuFrom } from './rule-menu.tsx';

export function RuleHeader({
  rule,
  nameField,
  onSelect,
  onNewRule,
}: {
  rule: Rule;
  // The rule's name over it (rule-intro.tsx), a field of its own.
  nameField: RefObject<HTMLInputElement | null>;
  onSelect: (id: string | null) => void;
  // New rule, in a group ('' for none): the group's crumb's.
  onNewRule: (group: string) => void;
}) {
  const [menu] = useState(createMenuHandle<RuleMenuFrom>);
  // The name's crumb, and whether it's a field to rename the rule in.
  const nameCrumb = useRef<HTMLButtonElement>(null);
  const [renaming, setRenaming] = useState(false);
  function rename() {
    if (nameCrumb.current?.checkVisibility()) {
      setRenaming(true);
      return;
    }
    nameField.current?.focus();
    nameField.current?.select();
  }
  return (
    <RulesHead
      title={ruleTitle(rule)}
      crumbs={
        <RuleCrumbs
          rule={rule}
          group={groupOf(rule)}
          menu={menu}
          nameCrumb={nameCrumb}
          renaming={renaming}
          onRenaming={setRenaming}
          onNewRule={onNewRule}
        />
      }
      backTestId="rule-back"
      onBack={() => onSelect(null)}
    >
      <Tooltip label="Duplicate">
        <Button
          size="icon"
          aria-label="Duplicate"
          data-testid="duplicate-rule"
          onClick={() => onSelect(duplicateRule(rule))}
          className="border border-input"
        >
          <Icon name="copy" size={16} />
        </Button>
      </Tooltip>
      <RuleMenuButton handle={menu} />
      <RuleMenu handle={menu} rule={rule} onSelect={onSelect} onRename={rename} />
    </RulesHead>
  );
}
