// A rule's switch, in the rule list and the popup: the green dot, pulsing while the rule is on and
// answering requests; still while it's on but its group is off, or Ghostfetch is, as it then
// doesn't answer; and grey while the rule is off. Clicking it always turns the rule itself on or
// off, its group as it was. Its tooltip says which: its own, or one the list's dots share (`tip`).
import type { ComponentProps } from 'react';
import { editRule, pausedStore, ruleTitle } from '../index.ts';
import type { Rule } from '../index.ts';
import { useStore } from '../../../ui/use-store.ts';
import { SignalSwitch } from '../../../ui/kit/signal-switch.tsx';
import { Tooltip, TooltipTrigger } from '../../../ui/kit/tooltip.tsx';
import type { TooltipHandle } from '../../../ui/kit/tooltip.tsx';

export function RuleSwitch({
  rule,
  groupOff = '',
  immediate = false,
  tip,
  ...props
}: Omit<ComponentProps<typeof SignalSwitch>, 'checked' | 'onCheckedChange' | 'paused'> & {
  rule: Rule;
  // The name of the rule's group while that's off ('' while it's on, or the rule is in none). The
  // list passes it, so a row it keeps as it was (a memo) still draws again when it changes.
  groupOff?: string;
  // Save at once rather than after the editor's short pause: the popup can close at any moment.
  immediate?: boolean;
  // The tooltip the list's dots share (SharedTooltip), rather than one of its own.
  tip?: TooltipHandle;
}) {
  const { paused } = useStore(pausedStore);
  const label = !rule.enabled
    ? 'Off. Click to turn this rule on'
    : paused
      ? 'On, but Ghostfetch is off. Click to turn this rule off'
      : groupOff
        ? `On, but ${groupOff} is off. Click to turn this rule off`
        : 'On. Click to turn this rule off';
  const dot = (
    <SignalSwitch
      checked={rule.enabled}
      paused={paused || Boolean(groupOff)}
      aria-label={`Turn “${ruleTitle(rule)}” on or off`}
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
  return tip ? (
    <TooltipTrigger handle={tip} label={label}>
      {dot}
    </TooltipTrigger>
  ) : (
    <Tooltip label={label}>{dot}</Tooltip>
  );
}
