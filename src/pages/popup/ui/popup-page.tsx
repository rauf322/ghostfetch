// The toolbar popup, with no switches: Ghostfetch says what's on in words, after T3 Code. A header
// with Recording and Pause, Ghostfetch on the tab's page in one line, then three tabs: what each
// rule did on this page, every rule, and the sites Ghostfetch runs on.
import { useState } from 'react';
import {
  countWords,
  isSiteEnabled,
  ruleStore,
  settingsStore,
  siteOf,
  siteStore,
} from '../../../shared/api/index.ts';
import { useStore } from '../../../shared/react/index.ts';
import { Segmented, SegmentedItem } from '../../../shared/ui/kit/segmented.tsx';
import { usePageCounts } from '../model/use-page-counts.ts';
import { PopupFooter } from './popup-footer.tsx';
import { PopupHeader } from './popup-header.tsx';
import { RuleList } from './rule-list.tsx';
import { SiteLine } from './site-line.tsx';
import { BUILT_IN_HOSTS, SitesTab } from './sites-tab.tsx';
import { ThisPage } from './this-page.tsx';

type View = 'page' | 'rules' | 'sites';

export function PopupPage({
  windowId,
  activeTab,
}: {
  windowId: number;
  activeTab: chrome.tabs.Tab | undefined;
}) {
  const { enabled, record } = useStore(settingsStore);
  const { rules } = useStore(ruleStore);
  const { sites } = useStore(siteStore);
  const host = siteOf(activeTab?.url);
  const runsHere = isSiteEnabled(sites, activeTab?.url);
  const counts = usePageCounts(activeTab?.id, runsHere);
  // A tab that isn't on a website has no page to tell about, so it opens on every rule.
  const [view, setView] = useState<View>(host ? 'page' : 'rules');
  // How many rules answered on the page, while that's known (recording, and Ghostfetch on there).
  const answering = counts?.record
    ? rules.filter((rule) => rule.enabled && countWords(counts.rules[rule.id])).length
    : null;

  return (
    <div className="flex flex-col gap-2.5 p-3.5">
      <PopupHeader enabled={enabled} record={record} />
      <SiteLine tab={activeTab} host={host} runsHere={runsHere} enabled={enabled} />
      <Segmented
        aria-label="Show"
        value={view}
        onValueChange={(value) => setView(value as View)}
      >
        <SegmentedItem value="page" data-testid="view-page">
          This page
          {answering !== null && <Count value={answering} />}
        </SegmentedItem>
        <SegmentedItem value="rules" data-testid="view-rules">
          All rules
          <Count value={rules.length} />
        </SegmentedItem>
        <SegmentedItem value="sites" data-testid="view-sites">
          Sites
          <Count value={BUILT_IN_HOSTS.length + sites.length} />
        </SegmentedItem>
      </Segmented>
      {view === 'page' && (
        <ThisPage
          tab={activeTab}
          host={host}
          runsHere={runsHere}
          enabled={enabled}
          rules={rules}
          counts={counts}
          windowId={windowId}
        />
      )}
      {view === 'rules' &&
        (rules.length ? (
          <RuleList
            rules={rules}
            counts={counts?.record ? counts.rules : undefined}
            split={false}
            enabled={enabled}
            windowId={windowId}
            title="All rules"
          />
        ) : (
          <p className="px-1 text-meta text-t50">
            No rules yet. Open the editor to make one.
          </p>
        ))}
      {view === 'sites' && <SitesTab sites={sites} tab={activeTab} />}
      <PopupFooter
        windowId={windowId}
        quiet={view === 'page' && Boolean(host) && !runsHere}
      />
    </div>
  );
}

function Count({ value }: { value: number }) {
  return <span className="ml-1.5 font-normal text-t40 tabular-nums">{value}</span>;
}
