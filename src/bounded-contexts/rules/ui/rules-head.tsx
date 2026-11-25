// The bar across the top of a rule or New rule: in a narrow panel a button back to the sidebar;
// beside the sidebar, the button that hides it and where you are ("Rules / New rule"; a rule's,
// its crumbs, which are controls: rule-editor/rule-crumbs.tsx); and whatever goes at the right
// end (a rule's Duplicate and ⋯ menu).
import type { ReactNode } from 'react';
import { Button } from '../../../ui/kit/button.tsx';
import { Icon } from '../../../ui/kit/icon.tsx';
import { Tooltip } from '../../../ui/kit/tooltip.tsx';
import { PaneHead } from '../../../ui/list-detail.tsx';
import { SidebarToggle } from '../../../ui/sidebar.tsx';

export function RulesHead({
  title,
  crumbs,
  backTestId,
  onBack,
  children,
}: {
  title: string;
  // Where you are, in a wide editor, instead of "Rules / title".
  crumbs?: ReactNode;
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
      {crumbs ?? (
        <span
          data-testid="rules-head-path"
          className="hidden min-w-0 truncate px-1 text-control text-t40 wide:block"
        >
          {'Rules '}
          <span className="text-t30">/</span> <span className="text-t80">{title}</span>
        </span>
      )}
      <span className="ml-auto" />
      {children}
    </PaneHead>
  );
}
