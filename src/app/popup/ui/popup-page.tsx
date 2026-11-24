// The toolbar popup: Ghostfetch says what's on in words, after T3 Code, and each rule has its dot
// to turn it on or off. A header with Recording and Pause, Ghostfetch on the tab's page in one
// line, then three tabs: what each rule did on this page, every rule, and the sites Ghostfetch
// runs on.
import { useState } from 'react';
import { pausedStore, ruleStore } from '../../../bounded-contexts/rules/index.ts';
import {
  isSiteEnabled,
  siteOf,
  siteStore,
} from '../../../bounded-contexts/sites/index.ts';
import { countWords, recordingStore } from '../../../bounded-contexts/traffic/index.ts';
import { useStore } from '../../../ui/use-store.ts';
import { Segmented, SegmentedItem } from '../../../ui/kit/segmented.tsx';
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
  const { paused } = useStore(pausedStore);
  const { recording } = useStore(recordingStore);
  const { rules, entries } = useStore(ruleStore);
  const { sites } = useStore(siteStore);
  const host = siteOf(activeTab?.url);
  const runsHere = isSiteEnabled(sites, activeTab?.url);
  const counts = usePageCounts(activeTab?.id, runsHere);
  // A tab that isn't on a website has no page to tell about, so it opens on every rule.
  const [view, setView] = useState<View>(host ? 'page' : 'rules');
  // How many rules answered on the page, while that's known (recording, and Ghostfetch on there):
  // the ones under "Answering here" (RuleList), on now or not.
  const answering = counts?.record
    ? rules.filter((rule) => countWords(counts.rules[rule.id])).length
    : null;

  return (
    <div className="flex flex-col gap-2.5 p-3.5">
      <PopupHeader enabled={!paused} record={recording} />
      <SiteLine tab={activeTab} host={host} runsHere={runsHere} enabled={!paused} />
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
          enabled={!paused}
          rules={rules}
          entries={entries}
          counts={counts}
          windowId={windowId}
        />
      )}
      {view === 'rules' &&
        (entries.length ? (
          <RuleList
            rules={rules}
            entries={entries}
            counts={counts?.record ? counts.rules : undefined}
            split={false}
            enabled={!paused}
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
