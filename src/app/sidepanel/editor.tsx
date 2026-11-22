// The full editor: the sidebar (the Rules and Traffic views and the rules; in a narrow panel a top
// bar has the two views as tabs instead), and beside it the open view. Ghostfetch's own switch is
// the popup's; here a bar says when it's off. Both views stay mounted, and the log of the tab it watches runs for as long as the editor
// is open: Traffic lists it, a rule says how often it fired there, and New rule offers what the
// page just asked for. Between the views it opens rules: one picked in the sidebar, one picked in
// Traffic, one made by New rule or from a captured response, the first of an import, and one the
// popup asks for. A rule it makes goes into the group New rule and Mock this response offer, at its
// top: the one the last rule made went into, or the group whose + was clicked. While Agent access
// is on, it does what a coding agent's tools ask (agent-access/).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAgentAccess } from '../../agent-access/ui/index.ts';
import { RulesPage } from '../../rules/ui/index.ts';
import { TrafficPage, useTrafficLog } from '../../traffic/ui/index.ts';
import {
  addRule,
  createResponseCapture,
  findRule,
  fromServer,
  keepServerResponse,
  normalizeRule,
  pausedStore,
  responseFromEntry,
  ruleStore,
} from '../../rules/index.ts';
import type { Rule } from '../../rules/index.ts';
import type { LogEntry } from '../../traffic/index.ts';
import { watchRuleRequests } from '../../platform/index.ts';
import { useStore } from '../../ui/use-store.ts';
import { cn } from '../../ui/cn.ts';
import { diffPreferred, rememberDiff } from '../../body-editor/index.ts';
import { Alert } from '../../ui/kit/alert.tsx';
import { Tabs, TabsContent } from '../../ui/kit/tabs.tsx';
import { notify } from '../../ui/kit/toast.tsx';
import { Split } from '../../ui/list-detail.tsx';
import { lastRuleGroup, rememberRuleGroup } from '../../rules/ui/new-rule-group.ts';
import { ImportRulesInput, exportRules } from '../../rules/ui/rules-file.tsx';
import { SidebarHandle } from '../../ui/sidebar.tsx';
import { Sidebar } from './sidebar.tsx';
import type { View } from './sidebar.tsx';
import { TopBar } from './top-bar.tsx';

// The view the editor showed last, which it opens on.
const VIEW = 'ghostfetch.view';

export function Editor({ inTab, windowId }: { inTab: boolean; windowId: number }) {
  const { paused } = useStore(pausedStore);
  // Draws again when the rules change: whether the open rule is still there decides what a narrow
  // panel shows.
  useStore(ruleStore);
  const [view, setView] = useState<View>(() =>
    localStorage.getItem(VIEW) === 'traffic' ? 'traffic' : 'rules',
  );
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  // New rule was clicked (the + in the sidebar), and no rule has been opened since: the composer,
  // with the cursor in it.
  const [composing, setComposing] = useState(false);
  // A rule New rule just made, whose body gets the cursor, once: the body says when it has it.
  const [created, setCreated] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // The group a rule made here goes into ('' for none), as New rule's and Mock this response's
  // pickers show it.
  const [ruleGroup, setRuleGroup] = useState(lastRuleGroup);
  // The side panel follows the active tab; the editor in a tab keeps the tab it picked.
  const log = useTrafficLog(!inTab);
  useAgentAccess({ log, inTab });
  const importInput = useRef<HTMLInputElement>(null);
  const chooseFile = () => importInput.current!.click();

  const showView = useCallback((name: View) => {
    setView(name);
    localStorage.setItem(VIEW, name);
  }, []);

  const select = useCallback((id: string | null) => {
    setCreated(null);
    setComposing(false);
    setSelectedRule(id);
  }, []);

  const openRule = useCallback(
    (id: string) => {
      showView('rules');
      select(findRule(id) ? id : null);
    },
    [showView, select],
  );

  // A rule made here, at the top of the group the pickers show, or of the list: that group is the
  // one the next rule goes into to start with, too.
  const place = useCallback(
    (rule: Rule) => {
      rememberRuleGroup(ruleGroup);
      return addRule(rule, { group: ruleGroup, index: 0 });
    },
    [ruleGroup],
  );

  // A rule made from a request (Mock this response, New rule's Mock) keeps the server's response
  // it was made from, for its body's Diff: if the server gave it, not a rule.
  const mockRule = useCallback(
    (draft: Rule, entry: LogEntry) => {
      const rule = place(normalizeRule(draft));
      if (fromServer(entry)) keepServerResponse(rule.id, responseFromEntry(entry));
      openRule(rule.id);
      notify('Rule created', {
        kind: 'success',
        description: 'Edit the body: it applies right away.',
      });
    },
    [openRule, place],
  );

  const openTraffic = useCallback(() => showView('traffic'), [showView]);

  // New rule: the composer takes the open rule's place, with the cursor in it, the group its
  // picker shows the one whose + was clicked, or else the one the last rule made went into.
  const compose = useCallback(
    (group?: string) => {
      setQuery('');
      setRuleGroup(group ?? lastRuleGroup());
      select(null);
      setComposing(true);
      showView('rules');
    },
    [select, showView],
  );

  // A new rule goes first in its group or the list, open with the cursor in its body: in the
  // editor, not Diff, which a body is typed in out of.
  const create = useCallback(
    (rule: Rule) => {
      setQuery('');
      if (diffPreferred()) rememberDiff(false);
      const added = place(rule);
      select(added.id);
      setCreated(added.id);
    },
    [select, place],
  );

  const forgetCreated = useCallback(() => setCreated(null), []);
  const cancelCompose = useCallback(() => setComposing(false), []);

  // "Open this rule" from the popup.
  useEffect(() => watchRuleRequests(openRule), [openRule]);

  // A rule with no server's response to compare its body with gets one from the log: the newest
  // request it matches that no rule answered. As requests arrive, and a moment after the rules
  // change, as a rule just made may match a request from before.
  useEffect(() => {
    const capture = createResponseCapture();
    const scan = () => capture.scan(log.snapshot().entries);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scanSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(scan, 300);
    };
    scan();
    const stopLog = log.subscribe(scan);
    const stopRules = ruleStore.subscribe(scanSoon);
    return () => {
      clearTimeout(timer);
      stopLog();
      stopRules();
      capture.stop();
    };
  }, [log]);

  const composingNow = composing && !selectedRule;
  const picked = Boolean(findRule(selectedRule)) || composingNow;
  // In a narrow panel the Rules view is the sidebar, until something is picked in it.
  const sidebarScreen = view === 'rules' && !picked;

  return (
    <Tabs
      value={view}
      onValueChange={(next) => showView(next as View)}
      className="h-screen flex-col overflow-hidden"
    >
      <TopBar log={log} inTab={inTab} windowId={windowId} onImport={chooseFile} />
      {paused && (
        <Alert variant="paused" className="flex-none">
          Ghostfetch is off. Rules aren't applied until you turn it on from its toolbar
          icon.
        </Alert>
      )}

      <Split className="flex-1">
        <Sidebar
          view={view}
          onView={showView}
          log={log}
          screen={sidebarScreen}
          query={query}
          onQueryChange={setQuery}
          selectedId={selectedRule}
          // A rule picked in the sidebar opens in the Rules view, wherever the editor was: the
          // sidebar stands beside Traffic too.
          onSelect={openRule}
          onNewRule={compose}
          onImport={chooseFile}
          onExport={exportRules}
          inTab={inTab}
          windowId={windowId}
        />
        <SidebarHandle list="sidebar" />
        {/* A size container (main), which a rule's header asks the width of. */}
        <main
          className={cn(
            '@container/main flex min-h-0 min-w-0 flex-1 flex-col',
            sidebarScreen && 'max-wide:hidden',
          )}
        >
          <TabsContent
            value="rules"
            keepMounted
            data-testid="view-rules"
            className="flex min-h-0 flex-1 flex-col"
          >
            <RulesPage
              log={log}
              selectedId={selectedRule}
              composing={composingNow}
              created={created}
              ruleGroup={ruleGroup}
              onRuleGroupChange={setRuleGroup}
              onSelect={select}
              onCreate={create}
              onBodyFocused={forgetCreated}
              onCancel={cancelCompose}
              onMock={mockRule}
              onOpenTraffic={openTraffic}
            />
          </TabsContent>
          <TabsContent
            value="traffic"
            keepMounted
            data-testid="view-traffic"
            className="flex min-h-0 flex-1 flex-col"
          >
            <TrafficPage
              log={log}
              ruleGroup={ruleGroup}
              onRuleGroupChange={setRuleGroup}
              onMock={mockRule}
              onOpenRule={openRule}
            />
          </TabsContent>
        </main>
      </Split>

      <ImportRulesInput
        ref={importInput}
        onImported={(rules) => {
          if (rules[0]) openRule(rules[0].id);
        }}
      />
    </Tabs>
  );
}
