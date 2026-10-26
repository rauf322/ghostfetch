// The full editor: a top bar with the Rules and Traffic tabs, the master switch and the ⋯ menu,
// then the two views. Both stay mounted, so Traffic keeps listening while Rules shows.
import { useCallback, useEffect, useRef, useState } from 'react';
import { MasterSwitch } from '../../components/master-switch.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import {
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs.tsx';
import { notify } from '../../components/ui/toast.tsx';
import { download, openSidePanel } from '../../lib/dom.ts';
import { normalizeRule } from '../../lib/store.ts';
import type { Rule } from '../../lib/store.ts';
import { addRule, addRules, findRule, state, useUiState } from '../../lib/state.ts';
import { RulesView } from '../../views/rules-view.tsx';
import { TrafficView } from '../../views/traffic-view.tsx';

type View = 'rules' | 'traffic';

const CONTENT_TYPES = [
  'application/json',
  'text/plain',
  'text/html',
  'application/xml',
  'application/javascript',
  'application/graphql-response+json',
];
const HEADER_NAMES = [
  'Authorization',
  'Content-Type',
  'Accept',
  'Accept-Language',
  'Cache-Control',
  'Cookie',
  'Set-Cookie',
  'Origin',
  'Referer',
  'User-Agent',
  'X-Requested-With',
  'Access-Control-Allow-Origin',
  'Access-Control-Allow-Methods',
  'Access-Control-Allow-Headers',
  'Access-Control-Allow-Credentials',
  'Access-Control-Expose-Headers',
  'Content-Security-Policy',
  'X-Frame-Options',
];

// Tab counts are zero-padded, like the rule numbers: "Rules 08".
const pad = (count: number) => String(count).padStart(2, '0');

export function App({ inTab, windowId }: { inTab: boolean; windowId: number }) {
  const { enabled, rules } = useUiState();
  const [view, setView] = useState<View>(() =>
    localStorage.getItem('mocktail.view') === 'traffic' ? 'traffic' : 'rules',
  );
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [trafficCount, setTrafficCount] = useState(0);
  const importInput = useRef<HTMLInputElement>(null);

  const showView = useCallback((name: View) => {
    setView(name);
    localStorage.setItem('mocktail.view', name);
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
    if (!state.rules.length) return notify('There are no rules to export yet');
    const date = new Date().toISOString().slice(0, 10);
    download(
      `ghostfetch-rules-${date}.json`,
      JSON.stringify(
        { ghostfetch: 1, exportedAt: new Date().toISOString(), rules: state.rules },
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
        <RulesView
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
        <TrafficView
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
      <datalist id="content-types">
        {CONTENT_TYPES.map((type) => (
          <option key={type} value={type} />
        ))}
      </datalist>
      <datalist id="header-names">
        {HEADER_NAMES.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </Tabs>
  );
}
