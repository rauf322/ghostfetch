// The popup's footer: the editor in the side panel, or in a tab of its own.
import { openInSidePanel, openInTab } from '../../../shared/api/index.ts';
import { Button } from '../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../shared/ui/kit/icon.tsx';

export function PopupFooter({ windowId }: { windowId: number }) {
  return (
    <footer className="grid grid-cols-2 gap-2">
      <Button variant="primary" size="lg" onClick={() => openInSidePanel(windowId)}>
        Side panel <Icon name="arrow" size={13} />
      </Button>
      <Button
        size="lg"
        onClick={() => {
          openInTab();
          window.close();
        }}
      >
        Open in tab <Icon name="external" size={13} />
      </Button>
    </footer>
  );
}
