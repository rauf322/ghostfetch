// The Agent button in the sidebar's footer, which opens Agent access (agent-panel.tsx): an icon,
// as the footer's others are, with its tooltip. While it's on, a dot on its icon says how it is:
// green and pulsing with an agent connected, grey while it waits for one or its code was turned
// down.
import { useStore } from '../../../ui/use-store.ts';
import { Button } from '../../../ui/kit/button.tsx';
import { Icon } from '../../../ui/kit/icon.tsx';
import { SignalDot } from '../../../ui/kit/signal-dot.tsx';
import { Tooltip } from '../../../ui/kit/tooltip.tsx';
import { agentStore } from '../infrastructure/agent-connection.ts';

export function AgentButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { status } = useStore(agentStore);
  return (
    <Tooltip label="Agent access: a coding agent reads and changes your rules">
      <Button
        variant="ghost"
        size="icon"
        data-testid="agent-button"
        data-status={status}
        aria-expanded={open}
        aria-label="Agent access"
        onClick={onToggle}
      >
        <span className="relative flex">
          <Icon name="terminal" size={16} />
          {/* In the icon's empty corner, above the underscore and right of the chevron. */}
          {status !== 'off' && (
            <SignalDot on={status === 'connected'} className="absolute top-0 right-0" />
          )}
        </span>
      </Button>
    </Tooltip>
  );
}
