// The editor's sidebar, after T3 Code's: Ghostfetch's name, the search row (a bare field, which "/"
// puts the cursor in, then New group and New rule), the two views, Rules and Traffic, with their
// counts, the rules in their order (bounded-contexts/rules/ui's RuleList, under how many are on),
// and along the bottom icons, each with its tooltip: the ⋯ menu, lit while it's open, Import,
// Export and Agent. From 760px wide it stands beside the open view, as wide as its edge was
// dragged, or hidden (ui/sidebar.tsx); in a narrow side panel it's the Rules view's own screen,
// under the top bar, which then has the name, the two views and the ⋯. A rule's dot turns it on or
// off; Ghostfetch's own switch and recording's are in the toolbar popup. The footer's Agent opens
// Agent access over it (bounded-contexts/agent-access/). For five seconds after a rule or a group
// is deleted the footer says so instead, with Undo, which ⌘Z does too (UndoNotice,
// bounded-contexts/rules/ui/undo-notice.tsx).
import { useEffect, useRef, useState } from 'react';
import { AgentButton, AgentPanel } from '../../bounded-contexts/agent-access/ui/index.ts';
import {
  RuleList,
  RuleListButtons,
  UndoNotice,
  listenForUndoKey,
  setListSearch,
} from '../../bounded-contexts/rules/ui/index.ts';
import { ruleStore } from '../../bounded-contexts/rules/index.ts';
import type { TrafficLog } from '../../bounded-contexts/traffic/index.ts';
import { useStore } from '../../ui/use-store.ts';
import { useTrafficValue } from '../../bounded-contexts/traffic/ui/index.ts';
import { cn } from '../../ui/cn.ts';
import { Button } from '../../ui/kit/button.tsx';
import { Icon } from '../../ui/kit/icon.tsx';
import type { IconName } from '../../ui/kit/icon.tsx';
import { Tooltip } from '../../ui/kit/tooltip.tsx';
import { ListPane, PaneFooter, SearchField } from '../../ui/list-detail.tsx';
import { useSidebarHidden } from '../../ui/sidebar.tsx';
import { EditorMenu } from './editor-menu.tsx';

export type View = 'rules' | 'traffic';

interface SidebarProps {
  view: View;
  onView: (view: View) => void;
  // The editor's log of the page it watches, for the Traffic row's count and what each rule did.
  log: TrafficLog;
  // In a narrow panel, whether it's the screen: the Rules view, with nothing open in it.
  screen: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  selectedId: string | null;
  // A rule was picked: it opens, in the Rules view, from Traffic too. null: the open rule was
  // deleted from its row's ⋯ menu, and closes, the view staying as it is.
  onSelect: (id: string | null) => void;
  // New rule: the + (in the group New rule offers), or a group's + (in that group).
  onNewRule: (group?: string) => void;
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
  const [agentOpen, setAgentOpen] = useState(false);

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

  // ⌘Z (Ctrl+Z elsewhere) undoes the delete the footer says was made, for as long as it says so,
  // from anywhere a field, the body editor or a menu doesn't have the keyboard
  // (bounded-contexts/rules/ui/undo-delete.ts).
  useEffect(listenForUndoKey, []);

  // A group's name to type in the list, a copy's or a new one's, clears a search that would keep
  // it out of sight, as the field's own clear does (bounded-contexts/rules/ui/renaming.ts).
  useEffect(() => {
    setListSearch({ query, clear: () => onQueryChange('') });
  }, [query, onQueryChange]);

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
      <div className="flex h-12 flex-none items-center gap-0.5 px-1.5 wide:h-10">
        <SearchField
          ref={search}
          bare
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search rules"
          aria-label="Search rules"
          hint="/"
        />
        <RuleListButtons onCreate={onNewRule} />
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
        log={log}
      />
      {agentOpen && (
        <AgentPanel onClose={() => setAgentOpen(false)} onOpenRule={onSelect} />
      )}
      <PaneFooter>
        <UndoNotice>
          <EditorMenu
            inTab={inTab}
            windowId={windowId}
            onImport={onImport}
            files={false}
            testId="sidebar-menu"
            className="max-wide:hidden"
          />
          <FooterButton icon="import" label="Import rules" onClick={onImport} />
          <FooterButton icon="export" label="Export all rules" onClick={onExport} />
          <AgentButton open={agentOpen} onToggle={() => setAgentOpen(!agentOpen)} />
        </UndoNotice>
      </PaneFooter>
    </ListPane>
  );
}

// One of the footer's icons: its words are its tooltip's, and its name for a screen reader.
function FooterButton({
  icon,
  label,
  onClick,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label}>
      <Button variant="ghost" size="icon" aria-label={label} onClick={onClick}>
        <Icon name={icon} size={16} />
      </Button>
    </Tooltip>
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
