// The full editor: a top bar with the Rules and Traffic tabs, the master switch and the ⋯ menu,
// then the two views. Both stay mounted, and the log of the tab it watches runs for as long as the
// editor is open: Traffic lists it, a rule says how often it fired there, and New rule offers what
// the page just asked for. Between the views it opens rules: one picked in Traffic, one made from
// a captured response, the first of an import, and one the popup asks for.
import { useCallback, useEffect, useRef, useState } from 'react';
import { RulesPage } from '../../pages/rules/index.ts';
import { TrafficPage } from '../../pages/traffic/index.ts';
import {
  addRule,
  findRule,
  normalizeRule,
  settingsStore,
  watchRuleRequests,
} from '../../shared/api/index.ts';
import type { Rule } from '../../shared/api/index.ts';
import { useStore, useTrafficLog } from '../../shared/react/index.ts';
import { Alert } from '../../shared/ui/kit/alert.tsx';
import { Tabs, TabsContent } from '../../shared/ui/kit/tabs.tsx';
import { notify } from '../../shared/ui/kit/toast.tsx';
import { ImportRulesInput, exportRules } from '../../shared/ui/rules-file.tsx';
import { TopBar } from './top-bar.tsx';

type View = 'rules' | 'traffic';
// The tab the editor showed last, which it opens on.
const VIEW = 'ghostfetch.view';

export function Editor({ inTab, windowId }: { inTab: boolean; windowId: number }) {
  const { enabled } = useStore(settingsStore);
  const [view, setView] = useState<View>(() =>
    localStorage.getItem(VIEW) === 'traffic' ? 'traffic' : 'rules',
  );
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [trafficCount, setTrafficCount] = useState(0);
  // The side panel follows the active tab; the editor in a tab keeps the tab it picked.
  const log = useTrafficLog(!inTab);
  const importInput = useRef<HTMLInputElement>(null);
  const chooseFile = () => importInput.current!.click();

  const showView = useCallback((name: View) => {
    setView(name);
    localStorage.setItem(VIEW, name);
  }, []);

  const openRule = useCallback(
    (id: string) => {
      showView('rules');
      setSelectedRule(findRule(id) ? id : null);
    },
    [showView],
  );

  const mockRule = useCallback(
    (draft: Rule) => {
      const rule = addRule(normalizeRule(draft), 0);
      openRule(rule.id);
      notify('Rule created. Edit the body and it applies right away.');
    },
    [openRule],
  );

  const openTraffic = useCallback(() => showView('traffic'), [showView]);

  // "Open this rule" from the popup.
  useEffect(() => watchRuleRequests(openRule), [openRule]);

  return (
    <Tabs
      value={view}
      onValueChange={(next) => showView(next as View)}
      className="h-screen flex-col overflow-hidden"
    >
      <TopBar
        trafficCount={trafficCount}
        inTab={inTab}
        windowId={windowId}
        onImport={chooseFile}
      />
      {!enabled && (
        <Alert variant="paused" className="flex-none">
          Ghostfetch is off. Rules aren't applied until you turn it back on.
        </Alert>
      )}

      <TabsContent
        value="rules"
        keepMounted
        data-testid="view-rules"
        className="min-h-0 flex-1"
      >
        <RulesPage
          log={log}
          selectedId={selectedRule}
          onSelect={setSelectedRule}
          onMock={mockRule}
          onOpenTraffic={openTraffic}
          onImport={chooseFile}
          onExport={exportRules}
        />
      </TabsContent>
      <TabsContent
        value="traffic"
        keepMounted
        data-testid="view-traffic"
        className="min-h-0 flex-1"
      >
        <TrafficPage
          log={log}
          onMock={mockRule}
          onOpenRule={openRule}
          onCount={setTrafficCount}
        />
      </TabsContent>

      <ImportRulesInput
        ref={importInput}
        onImported={(rules) => openRule(rules[0]!.id)}
      />
    </Tabs>
  );
}
