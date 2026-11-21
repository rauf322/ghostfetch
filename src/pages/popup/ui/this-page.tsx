// The This page tab: what each rule did on the tab's page, as the page counts it (usePageCounts).
// Where Ghostfetch isn't on, the one thing to do there instead: turn it on, which reloads the page.
import type { ReactNode } from 'react';
import { turnOnFor } from '../../../sites/index.ts';
import type { Entry, Rule } from '../../../rules/index.ts';
import type { PageCounts } from '../../../traffic/index.ts';
import { Button } from '../../../ui/kit/button.tsx';
import { RuleList } from './rule-list.tsx';

export function ThisPage({
  tab,
  host,
  runsHere,
  enabled,
  rules,
  entries,
  counts,
  windowId,
}: {
  tab: chrome.tabs.Tab | undefined;
  host: string;
  runsHere: boolean;
  enabled: boolean;
  rules: Rule[];
  entries: Entry[];
  counts: PageCounts | null | undefined;
  windowId: number;
}) {
  if (!host || tab?.id === undefined)
    return (
      <Note>This tab isn't on a website, so there's nothing here for Ghostfetch.</Note>
    );
  if (!runsHere) return <TurnOnHere host={host} tabId={tab.id} />;
  if (!rules.length) return <Note>No rules yet. Open the editor to make one.</Note>;
  // The page answers in a few milliseconds; until then, nothing rather than a list that jumps.
  if (counts === undefined) return null;
  return (
    <>
      {counts === null && <Note>Reload the page to see what each rule does on it.</Note>}
      {counts?.record === false && (
        <Note>Recording is off, so nothing here is counted.</Note>
      )}
      <RuleList
        rules={rules}
        entries={entries}
        counts={counts?.record ? counts.rules : undefined}
        split={counts?.record === true}
        enabled={enabled}
        windowId={windowId}
        title="Rules"
      />
    </>
  );
}

function TurnOnHere({ host, tabId }: { host: string; tabId: number }) {
  // An IP address covers only itself (siteCovers).
  const address = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
  return (
    <div
      data-testid="off-here"
      className="flex flex-col gap-2.5 rounded-lg bg-card p-3.5"
    >
      <p className="text-body text-t65">
        Ghostfetch is off on <span className="font-mono text-foreground">{host}</span>:
        requests here go to the server untouched.
      </p>
      <Button
        variant="primary"
        size="lg"
        data-testid="turn-on-here"
        onClick={() => turnOnFor(host, tabId)}
      >
        <span className="truncate">Turn on for {host}</span>
      </Button>
      <p className="text-meta text-t40">
        {address ? `Covers ${host} only` : `Covers ${host} and its subdomains`}. The page
        reloads.
      </p>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="px-1 text-meta text-t50">{children}</p>;
}
