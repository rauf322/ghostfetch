// The editor's ⋯ menu: import and export rules, and move the editor between a tab of its own and
// the side panel.
import { openInSidePanel, openInTab } from '../../features/open-editor/index.ts';
import { exportRules } from '../../features/rules-transfer/index.ts';
import { Button } from '../../shared/ui/kit/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shared/ui/kit/dropdown-menu.tsx';
import { Icon } from '../../shared/ui/kit/icon.tsx';

export function EditorMenu({
  inTab,
  windowId,
  onImport,
}: {
  inTab: boolean;
  windowId: number;
  onImport: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            title="More"
            className="h-full w-[35px] border-l border-border"
          />
        }
      >
        <Icon name="more" size={18} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={onImport}>
          <Icon name="import" /> Import rules…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportRules}>
          <Icon name="export" /> Export all rules
        </DropdownMenuItem>
        {inTab ? (
          <DropdownMenuItem onClick={() => openInSidePanel(windowId)}>
            <Icon name="panel" /> Open in side panel
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={openInTab}>
            <Icon name="tab" /> Open in a tab
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
