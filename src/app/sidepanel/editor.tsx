// The full editor: a top bar with the Rules and Traffic tabs, the master switch and the ⋯ menu,
// then the two views. Both stay mounted, so Traffic keeps listening while Rules shows.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  normalizeRule,
  addRule,
  addRules,
  findRule,
  ruleStore,
} from '../../entities/rule/index.ts';
import type { Rule } from '../../entities/rule/index.ts';
import { settingsStore } from '../../entities/settings/index.ts';
import { MasterSwitch } from '../../features/master-switch/index.ts';
import { RulesPage } from '../../pages/rules/index.ts';
import { TrafficPage } from '../../pages/traffic/index.ts';
import { download, openSidePanel } from '../../shared/lib/browser/index.ts';
import { useStore } from '../../shared/lib/react/index.ts';
import { Alert } from '../../shared/ui/kit/alert.tsx';
import { Button } from '../../shared/ui/kit/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shared/ui/kit/dropdown-menu.tsx';
import { Icon } from '../../shared/ui/kit/icon.tsx';
import {
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from '../../shared/ui/kit/tabs.tsx';
import { notify } from '../../shared/ui/kit/toast.tsx';

type View = 'rules' | 'traffic';

// Tab counts are zero-padded, like the rule numbers: "Rules 08".
const pad = (count: number) => String(count).padStart(2, '0');

export function Editor({ inTab, windowId }: { inTab: boolean; windowId: number }) {
  const { enabled } = useStore(settingsStore);
  const { rules } = useStore(ruleStore);
  const [view, setView] = useState<View>(() =>
    localStorage.getItem('ghostfetch.view') === 'traffic' ? 'traffic' : 'rules',
  );
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [trafficCount, setTrafficCount] = useState(0);
  const importInput = useRef<HTMLInputElement>(null);

  const showView = useCallback((name: View) => {
    setView(name);
    localStorage.setItem('ghostfetch.view', name);
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

  function exportRules() {
    if (!ruleStore.state.rules.length) return notify('There are no rules to export yet');
    const date = new Date().toISOString().slice(0, 10);
    download(
      `ghostfetch-rules-${date}.json`,
      JSON.stringify(
        {
          ghostfetch: 1,
          exportedAt: new Date().toISOString(),
          rules: ruleStore.state.rules,
        },
        null,
        2,
      ),
    );
    return undefined;
  }

  async function importFile(file: File) {
    try {
      const data = JSON.parse(await file.text());
      const incoming = Array.isArray(data) ? data : data?.rules;
      if (!Array.isArray(incoming) || !incoming.length)
        throw new Error('no rules found in this file');
      // A rule can run a script inside your app or redirect its requests elsewhere, so a rules
      // file is effectively code: imported rules start switched off until you've read them.
      const imported = incoming.map((rule: unknown) => ({
        ...normalizeRule(rule, { newId: true }),
        enabled: false,
      }));
      addRules(imported);
      openRule(imported[0]!.id);
      notify(
        `Imported ${imported.length} rule${imported.length === 1 ? '' : 's'}, switched off. Review them before turning them on: rules can run scripts and redirect requests.`,
        { duration: 7000 },
      );
    } catch (error) {
      notify(`Couldn't import: ${(error as Error).message}`, {
        kind: 'error',
        duration: 5000,
      });
    }
  }

  // Runs synchronously inside the click, which opening the side panel requires.
  function openPanel() {
    openSidePanel(windowId).then(() => window.close());
  }

  // "Open this rule" from the popup.
  useEffect(() => {
    async function focusRequestedRule() {
      const { focusRule } = await chrome.storage.session.get('focusRule');
      if (!focusRule) return;
      await chrome.storage.session.remove('focusRule');
      openRule(focusRule as string);
    }
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === 'session' && changes.focusRule?.newValue) focusRequestedRule();
    };
    chrome.storage.onChanged.addListener(onChanged);
    focusRequestedRule();
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [openRule]);

  return (
    <Tabs
      value={view}
      onValueChange={(next) => showView(next as View)}
      className="h-screen flex-col overflow-hidden"
    >
      {/* the top bar is a row of cells, like the site's header */}
      <header className="flex h-10 flex-none items-stretch border-b border-border">
        <div className="flex items-center gap-2 pr-[9px] pl-3 text-meta font-bold whitespace-nowrap uppercase tracking-[0.08em] text-t65">
          <img src="/icons/icon32.png" width={16} height={16} alt="" />
          <span className="max-[390px]:hidden">Ghostfetch</span>
        </div>
        <TabsList>
          <TabsTrigger value="rules" data-testid="tab-rules">
            Rules <TabsCount>{rules.length ? pad(rules.length) : ''}</TabsCount>
          </TabsTrigger>
          <TabsTrigger value="traffic" data-testid="tab-traffic">
            Traffic <TabsCount>{trafficCount ? pad(trafficCount) : ''}</TabsCount>
          </TabsTrigger>
        </TabsList>
        <div className="ml-auto flex items-stretch">
          <MasterSwitch
            title={
              enabled
                ? 'Ghostfetch is on. Click to turn every rule off.'
                : 'Ghostfetch is off. Click to turn it on.'
            }
            className="border-l border-border"
          />
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
              <DropdownMenuItem onClick={() => importInput.current!.click()}>
                <Icon name="import" /> Import rules…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportRules}>
                <Icon name="export" /> Export all rules
              </DropdownMenuItem>
              {inTab ? (
                <DropdownMenuItem onClick={openPanel}>
                  <Icon name="panel" /> Open in side panel
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => chrome.runtime.openOptionsPage()}>
                  <Icon name="tab" /> Open in a tab
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
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
          selectedId={selectedRule}
          onSelect={setSelectedRule}
          onImport={() => importInput.current!.click()}
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
          followActiveTab={!inTab}
          onMock={mockRule}
          onOpenRule={openRule}
          onCount={setTrafficCount}
        />
      </TabsContent>

      <input
        type="file"
        ref={importInput}
        data-testid="import-file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const [file] = event.target.files!;
          event.target.value = '';
          if (file) importFile(file);
        }}
      />
    </Tabs>
  );
}
