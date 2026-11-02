// The bar across the top of the Rules tab's detail pane: in a narrow panel a button back to the
// list; beside the list, the button that hides it and where you are ("Rules / Logged-in admin
// user", "Rules / New rule"); and whatever goes at the right end (a rule's menu and switch).
import type { ReactNode } from 'react';
import { Button } from '../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../shared/ui/kit/icon.tsx';
import { PaneHead } from '../../../shared/ui/list-detail.tsx';
import { SidebarToggle } from '../../../shared/ui/sidebar.tsx';

export function RulesHead({
  title,
  backTestId,
  onBack,
  children,
}: {
  title: string;
  backTestId: string;
  onBack: () => void;
  children?: ReactNode;
}) {
  return (
    <PaneHead className="h-12 items-center gap-1.5 border-b-0 px-2">
      <SidebarToggle />
      <Button
        variant="ghost"
        size="sm"
        title="All rules"
        data-testid={backTestId}
        onClick={onBack}
        className="gap-1 pr-2.5 pl-1 text-control text-t80 wide:hidden"
      >
        <Icon name="back" size={18} />
        Rules
      </Button>
      <span className="hidden min-w-0 truncate px-1 text-control text-t40 wide:block">
        {'Rules '}
        <span className="text-t30">/</span> <span className="text-t80">{title}</span>
      </span>
      <span className="ml-auto" />
      {children}
    </PaneHead>
  );
}
