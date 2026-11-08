// The editor's sidebar, after T3 Code's: Ghostfetch's name, the search field ("/" puts the cursor
// in it), the two views, Rules and Traffic, with their counts, the rules in their order
// (pages/rules' RuleList: how many are on, and + for a new one), and along the bottom the ⋯ menu,
// Import and Export. From 760px wide it stands beside the open view, as wide as its edge was
// dragged, or hidden (shared/ui/sidebar.tsx); in a narrow side panel it's the Rules view's own
// screen, under the top bar, which then has the name and the two views. Ghostfetch's own switch
// isn't here: it's in the popup.
import { useEffect, useRef } from 'react';
import { RuleList } from '../../pages/rules/index.ts';
import { ruleStore } from '../../shared/api/index.ts';
import type { TrafficLog } from '../../shared/api/index.ts';
import { useStore, useTrafficValue } from '../../shared/react/index.ts';
import { cn } from '../../shared/ui/cn.ts';
import { Button } from '../../shared/ui/kit/button.tsx';
import { Icon } from '../../shared/ui/kit/icon.tsx';
import type { IconName } from '../../shared/ui/kit/icon.tsx';
import { ListPane, PaneFooter, SearchField } from '../../shared/ui/list-detail.tsx';
import { useSidebarHidden } from '../../shared/ui/sidebar.tsx';
import { EditorMenu } from './editor-menu.tsx';

export type View = 'rules' | 'traffic';

interface SidebarProps {
  view: View;
  onView: (view: View) => void;
  // The editor's log of the page it watches, for the Traffic row's count.
  log: TrafficLog;
  // In a narrow panel, whether it's the screen: the Rules view, with nothing open in it.
  screen: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  selectedId: string | null;
  // A rule was picked: it opens, in the Rules view, from Traffic too.
  onSelect: (id: string) => void;
  onNewRule: () => void;
  onImport: () => void;
  onExport: () => void;
  inTab: boolean;
  windowId: number;
}

// Where "/" is a character to type rather than the way to the search field.
function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

export function Sidebar({
  view,
  onView,
  log,
  screen,
  query,
  onQueryChange,
  selectedId,
  onSelect,
  onNewRule,
  onImport,
  onExport,
  inTab,
  windowId,
}: SidebarProps) {
  const { rules } = useStore(ruleStore);
  const collapsed = useSidebarHidden();
  const search = useRef<HTMLInputElement>(null);

  // "/" puts the cursor in the search field, from anywhere that isn't a field itself (in the
  // body editor it's vim's search), while the field is on screen.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.defaultPrevented || isEditable(event.target)) return;
      const field = search.current;
      if (!field?.checkVisibility()) return;
      event.preventDefault();
      field.focus();
      field.select();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <ListPane
      id="sidebar"
      data-testid="sidebar"
      aria-label="Sidebar"
      screen={screen}
      collapsed={collapsed}
    >
      <div className="hidden h-12 flex-none items-center gap-2 pr-1 pl-[18px] wide:flex">
        <img
          src="/icons/icon32.png"
          width={18}
          height={18}
          alt=""
          className="rounded-[4px]"
        />
        <span className="truncate text-title font-semibold text-foreground">
          Ghostfetch
        </span>
      </div>
      <div className="flex h-12 flex-none items-center px-1.5 wide:h-10">
        <SearchField
          ref={search}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search rules"
          aria-label="Search rules"
          hint="/"
        />
      </div>
      <nav
        aria-label="Views"
        className="hidden flex-none flex-col gap-0.5 px-1.5 pt-1.5 pb-1 wide:flex"
      >
        <ViewRow
          icon="rule"
          label="Rules"
          count={rules.length}
          active={view === 'rules'}
          testId="nav-rules"
          onClick={() => onView('rules')}
        />
        <TrafficRow
          log={log}
          active={view === 'traffic'}
          onClick={() => onView('traffic')}
        />
      </nav>
      <RuleList
        selectedId={selectedId}
        query={query}
        onSelect={onSelect}
        onCreate={onNewRule}
      />
      <PaneFooter>
        <EditorMenu
          inTab={inTab}
          windowId={windowId}
          onImport={onImport}
          files={false}
          testId="sidebar-menu"
          className="max-wide:hidden"
        />
        <Button variant="cell" size="cell" onClick={onImport}>
          <Icon name="import" size={14} />
          Import
        </Button>
        <Button variant="cell" size="cell" onClick={onExport}>
          <Icon name="export" size={14} />
          Export
        </Button>
      </PaneFooter>
    </ListPane>
  );
}

// A view's row: its icon and name, with its count at the right end; the one that's open is filled.
function ViewRow({
  icon,
  label,
  count,
  active,
  testId,
  onClick,
}: {
  icon: IconName;
  label: string;
  count: number;
  active: boolean;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={cn(
        // Its icon over the rules' dots, and its name where their names start.
        'flex h-[34px] flex-none items-center gap-[7px] rounded-md px-2 text-control font-medium',
        active ? 'bg-pressed text-strong' : 'text-t65 hover:bg-hover hover:text-t80',
      )}
    >
      <Icon name={icon} size={16} />
      {label}
      <span className="ml-auto text-label font-normal text-t40 tabular-nums">
        {count || ''}
      </span>
    </button>
  );
}

// The Traffic row, whose count is how many requests the log has: it alone draws again as they
// arrive, not the sidebar and its rules.
function TrafficRow({
  log,
  active,
  onClick,
}: {
  log: TrafficLog;
  active: boolean;
  onClick: () => void;
}) {
  const count = useTrafficValue(log, (traffic) => traffic.entries.length);
  return (
    <ViewRow
      icon="activity"
      label="Traffic"
      count={count}
      active={active}
      testId="nav-traffic"
      onClick={onClick}
    />
  );
}
