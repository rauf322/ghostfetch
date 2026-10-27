// The popup's footer: the editor in the side panel, or in a tab of its own.
import { openInSidePanel, openInTab } from '../../../features/open-editor/index.ts';
import { Button } from '../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../shared/ui/kit/icon.tsx';

export function PopupFooter({ windowId }: { windowId: number }) {
  return (
    <footer className="grid grid-cols-2 border-t border-border">
      <Button
        onClick={() => openInSidePanel(windowId)}
        className="h-11 border-0 bg-transparent tracking-[0.2em] text-white"
      >
        Side panel <Icon name="arrow" size={13} />
      </Button>
      <Button
        onClick={() => {
          openInTab();
          window.close();
        }}
        className="h-11 border-0 border-l border-border bg-transparent tracking-[0.2em] text-t40"
      >
        Open in tab <Icon name="external" size={13} />
      </Button>
    </footer>
  );
}
