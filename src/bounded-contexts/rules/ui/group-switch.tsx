// A group's switch, in the popup's rules: the same green dot as a rule's, pulsing while the group
// is on, still while it's on but Ghostfetch is off, grey while it's off. Turned off, its rules stop
// answering, each keeping its own switch for when it's turned on again. Saved at once: the popup
// can close at any moment. The editor's list has the group's chip there instead, and turns the
// group off and on from its header's slot and its menus (group-header.tsx, group-menu.tsx).
import type { ComponentProps } from 'react';
import { pausedStore, turnGroup } from '../index.ts';
import type { Group } from '../index.ts';
import { useStore } from '../../../ui/use-store.ts';
import { SignalSwitch } from '../../../ui/kit/signal-switch.tsx';
import { Tooltip } from '../../../ui/kit/tooltip.tsx';

export function GroupSwitch({
  group,
  ...props
}: Omit<ComponentProps<typeof SignalSwitch>, 'checked' | 'onCheckedChange' | 'paused'> & {
  group: Group;
}) {
  const { paused } = useStore(pausedStore);
  return (
    <Tooltip
      label={
        !group.enabled
          ? `Off: its rules don't answer. Click to turn ${group.name} on`
          : !paused
            ? `On. Click to turn ${group.name} off, and its rules with it`
            : `On, but Ghostfetch is off. Click to turn ${group.name} off`
      }
    >
      <SignalSwitch
        checked={group.enabled}
        paused={paused}
        aria-label={`Turn the group “${group.name}” on or off`}
        onCheckedChange={(on) => turnGroup(group.id, on)}
        {...props}
      />
    </Tooltip>
  );
}
