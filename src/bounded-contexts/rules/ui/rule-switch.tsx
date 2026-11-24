// A rule's switch, in the rule list and the popup: the green dot, pulsing while the rule is on and
// answering requests; still while it's on but its group is off, or Ghostfetch is, as it then
// doesn't answer; and grey while the rule is off. Clicking it always turns the rule itself on or
// off, its group as it was. Its title says which.
import type { ComponentProps } from 'react';
import { editRule, pausedStore, ruleTitle } from '../index.ts';
import type { Rule } from '../index.ts';
import { useStore } from '../../../ui/use-store.ts';
import { SignalSwitch } from '../../../ui/kit/signal-switch.tsx';

export function RuleSwitch({
  rule,
  groupOff = '',
  immediate = false,
  ...props
}: Omit<ComponentProps<typeof SignalSwitch>, 'checked' | 'onCheckedChange' | 'paused'> & {
  rule: Rule;
  // The name of the rule's group while that's off ('' while it's on, or the rule is in none). The
  // list passes it, so a row it keeps as it was (a memo) still draws again when it changes.
  groupOff?: string;
  // Save at once rather than after the editor's short pause: the popup can close at any moment.
  immediate?: boolean;
}) {
  const { paused } = useStore(pausedStore);
  return (
    <SignalSwitch
      checked={rule.enabled}
      paused={paused || Boolean(groupOff)}
      aria-label={`Turn “${ruleTitle(rule)}” on or off`}
      title={
        !rule.enabled
          ? 'Off. Click to turn this rule on'
          : paused
            ? 'On, but Ghostfetch is off. Click to turn this rule off'
            : groupOff
              ? `On, but ${groupOff} is off. Click to turn this rule off`
              : 'On. Click to turn this rule off'
      }
      onCheckedChange={(on) =>
        editRule(
          rule.id,
          (current) => {
            current.enabled = on;
          },
          { immediate },
        )
      }
      {...props}
    />
  );
}
