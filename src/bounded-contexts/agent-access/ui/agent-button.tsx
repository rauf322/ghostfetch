// The Agent button in the sidebar's footer, which opens Agent access (agent-panel.tsx). While it's
// on, a dot on its icon says how it is: green and pulsing with an agent connected, grey while it
// waits for one or its code was turned down. Its name shows where the footer has room for it (the
// footer is a container): beside ⋯, Import and Export, the sidebar at its default width hasn't, and
// there it's an icon, as square as ⋯.
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
        variant="cell"
        size="cell"
        data-testid="agent-button"
        data-status={status}
        aria-expanded={open}
        aria-label="Agent access"
        onClick={onToggle}
        // With the name, the footer needs 268 px inside its padding (which is what a container
        // query measures), 280 px in all: this leaves a little over, for the fonts.
        className="@max-[284px]:px-[9px]"
      >
        <span className="relative flex">
          <Icon name="terminal" size={14} />
          {/* In the icon's empty corner, above the underscore and right of the chevron. */}
          {status !== 'off' && (
            <SignalDot on={status === 'connected'} className="absolute top-0 right-0" />
          )}
        </span>
        <span className="hidden @min-[284px]:inline">Agent</span>
      </Button>
    </Tooltip>
  );
}
