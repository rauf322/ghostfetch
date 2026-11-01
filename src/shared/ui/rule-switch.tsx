// A rule's switch, in the rule list, the rule's top bar and the popup: the green dot, pulsing
// while the rule is on and answering requests, still while it's on but Ghostfetch is off, and grey
// while the rule is off. Its title says which.
import type { ComponentProps } from 'react';
import { editRule, ruleTitle, settingsStore } from '../api/index.ts';
import type { Rule } from '../api/index.ts';
import { useStore } from '../react/index.ts';
import { SignalSwitch } from './kit/signal-switch.tsx';

export function RuleSwitch({
  rule,
  immediate = false,
  ...props
}: Omit<ComponentProps<typeof SignalSwitch>, 'checked' | 'onCheckedChange' | 'paused'> & {
  rule: Rule;
  // Save at once rather than after the editor's short pause: the popup can close at any moment.
  immediate?: boolean;
}) {
  const { enabled } = useStore(settingsStore);
  return (
    <SignalSwitch
      checked={rule.enabled}
      paused={!enabled}
      aria-label={`Turn “${ruleTitle(rule)}” on or off`}
      title={
        !rule.enabled
          ? 'Off. Click to turn this rule on'
          : enabled
            ? 'On. Click to turn this rule off'
            : 'On, but Ghostfetch is off. Click to turn this rule off'
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
