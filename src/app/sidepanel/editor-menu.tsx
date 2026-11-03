// The editor's ⋯ menu: import and export rules (`files`; the sidebar's footer has those as buttons
// beside the menu), move the editor between a tab of its own and the side panel, and pick a theme.
import { openInSidePanel, openInTab } from '../../shared/api/index.ts';
import { cn } from '../../shared/ui/cn.ts';
import { Button } from '../../shared/ui/kit/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../shared/ui/kit/dropdown-menu.tsx';
import { Icon } from '../../shared/ui/kit/icon.tsx';
import { exportRules } from '../../shared/ui/rules-file.tsx';
import { ThemeMenu } from '../../shared/ui/theme-menu.tsx';

export function EditorMenu({
  inTab,
  windowId,
  onImport,
  files = true,
  testId = 'editor-menu',
  className,
}: {
  inTab: boolean;
  windowId: number;
  onImport: () => void;
  files?: boolean;
  testId?: string;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            title="More"
            data-testid={testId}
            className={cn('self-center', className)}
          />
        }
      >
        <Icon name="more" size={18} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {files && (
          <>
            <DropdownMenuItem onClick={onImport}>
              <Icon name="import" /> Import rules…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportRules}>
              <Icon name="export" /> Export all rules
            </DropdownMenuItem>
          </>
        )}
        {inTab ? (
          <DropdownMenuItem onClick={() => openInSidePanel(windowId)}>
            <Icon name="panel" /> Open in side panel
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={openInTab}>
            <Icon name="tab" /> Open in a tab
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <ThemeMenu />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
