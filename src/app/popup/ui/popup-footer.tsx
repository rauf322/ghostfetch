// The popup's footer: the editor, in the side panel (Firefox: the sidebar), and beside it a small
// button for the editor in a tab of its own.
import { openInSidePanel, openInTab } from '../../../platform/index.ts';
import { Button } from '../../../ui/kit/button.tsx';
import { Icon } from '../../../ui/kit/icon.tsx';
import { Tooltip } from '../../../ui/kit/tooltip.tsx';

// `quiet`: another button on the popup is the one to press (Turn on for …), so this one steps back.
export function PopupFooter({ windowId, quiet }: { windowId: number; quiet: boolean }) {
  return (
    <footer className="flex gap-2">
      <Button
        variant={quiet ? 'outline' : 'primary'}
        size="lg"
        className="flex-1"
        onClick={() => openInSidePanel(windowId)}
      >
        <Icon name="panel" size={14} />
        Open editor
      </Button>
      <Tooltip label="Open the editor in a tab">
        <Button
          size="lg"
          className="w-9 px-0"
          aria-label="Open the editor in a tab"
          onClick={() => {
            openInTab();
            window.close();
          }}
        >
          <Icon name="external" size={14} />
        </Button>
      </Tooltip>
    </footer>
  );
}
