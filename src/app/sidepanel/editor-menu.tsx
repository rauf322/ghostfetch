// The editor's ⋯ menu: import and export rules (`files`; the sidebar's footer has those as buttons
// beside the menu), move the editor between a tab of its own and the side panel, and pick a theme
// and the appearance (contrast, font, text size). Its ⋯, in the sidebar's footer or in a narrow
// panel's top bar, stays filled while its menu is open, as under the pointer.
import { openInSidePanel, openInTab } from '../../platform/index.ts';
import { cn } from '../../ui/cn.ts';
import { Button } from '../../ui/kit/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/kit/dropdown-menu.tsx';
import { Icon } from '../../ui/kit/icon.tsx';
import { Tooltip } from '../../ui/kit/tooltip.tsx';
import { exportRules } from '../../bounded-contexts/rules/ui/rules-file.tsx';
import { AppearanceMenu, ThemeMenu } from '../../ui/theme-menu.tsx';

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
      <Tooltip label="More">
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="More"
              data-testid={testId}
              className={cn(
                'self-center data-popup-open:bg-pressed data-popup-open:text-foreground',
                className,
              )}
            />
          }
        >
          <Icon name="more" size={18} />
        </DropdownMenuTrigger>
      </Tooltip>
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
        <AppearanceMenu />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
