// A group's switch, in the editor's rule list and the popup: the same green dot as a rule's,
// pulsing while the group is on, still while it's on but Ghostfetch is off, grey while it's off.
// Turned off, its rules stop answering, each keeping its own switch for when it's turned on again.
// Saved at once: the popup can close at any moment.
import type { ComponentProps } from 'react';
import { pausedStore, turnGroup } from '../index.ts';
import type { Group } from '../index.ts';
import { useStore } from '../../ui/use-store.ts';
import { SignalSwitch } from '../../ui/kit/signal-switch.tsx';

export function GroupSwitch({
  group,
  ...props
}: Omit<ComponentProps<typeof SignalSwitch>, 'checked' | 'onCheckedChange' | 'paused'> & {
  group: Group;
}) {
  const { paused } = useStore(pausedStore);
  return (
    <SignalSwitch
      checked={group.enabled}
      paused={paused}
      aria-label={`Turn the group “${group.name}” on or off`}
      title={
        !group.enabled
          ? `Off: its rules don't answer. Click to turn ${group.name} on`
          : !paused
            ? `On. Click to turn ${group.name} off, and its rules with it`
            : `On, but Ghostfetch is off. Click to turn ${group.name} off`
      }
      onCheckedChange={(on) => turnGroup(group.id, on)}
      {...props}
    />
  );
}
