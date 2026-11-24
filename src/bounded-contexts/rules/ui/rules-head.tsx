// The bar across the top of a rule or New rule: in a narrow panel a button back to the sidebar;
// beside the sidebar, the button that hides it and where you are ("Rules / Logged-in admin
// user", "Rules / PR-1 / Users list" for a rule in a group, "Rules / New rule"); and whatever goes
// at the right end (a rule's menu and switch).
import type { ReactNode } from 'react';
import { Button } from '../../../ui/kit/button.tsx';
import { Icon } from '../../../ui/kit/icon.tsx';
import { Tooltip } from '../../../ui/kit/tooltip.tsx';
import { PaneHead } from '../../../ui/list-detail.tsx';
import { SidebarToggle } from '../../../ui/sidebar.tsx';

export function RulesHead({
  title,
  group = '',
  backTestId,
  onBack,
  children,
}: {
  title: string;
  // The name of the group the rule is in, if it's in one.
  group?: string;
  backTestId: string;
  onBack: () => void;
  children?: ReactNode;
}) {
  return (
    <PaneHead className="h-12 items-center gap-1.5 border-b-0 px-2">
      <SidebarToggle />
      <Tooltip label="All rules">
        <Button
          variant="ghost"
          size="sm"
          data-testid={backTestId}
          onClick={onBack}
          className="gap-1 pr-2.5 pl-1 text-control text-t80 wide:hidden"
        >
          <Icon name="back" size={18} />
          Rules
        </Button>
      </Tooltip>
      <span
        data-testid="rules-head-path"
        className="hidden min-w-0 truncate px-1 text-control text-t40 wide:block"
      >
        {'Rules '}
        <span className="text-t30">/</span>{' '}
        {group && (
          <>
            {`${group} `}
            <span className="text-t30">/</span>{' '}
          </>
        )}
        <span className="text-t80">{title}</span>
      </span>
      <span className="ml-auto" />
      {children}
    </PaneHead>
  );
}
