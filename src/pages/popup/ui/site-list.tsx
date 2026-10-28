// The sites Ghostfetch runs on, as a ticker line: the built-in hosts, then the sites you added,
// each with a × that turns Ghostfetch off there.
import { Fragment } from 'react';
import { removeSite } from '../../../shared/api/index.ts';
import { Label } from '../../../shared/ui/kit/label.tsx';

export function SiteList({
  sites,
  tab,
}: {
  // The sites you added.
  sites: string[];
  // The tab the popup opened on, which reloads if a site that covers it goes.
  tab: chrome.tabs.Tab | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-[5px] border-b border-border bg-code px-3.5 py-[9px] text-meta text-t65">
      <Label className="mr-1 tracking-[0.2em]">Runs on</Label>
      <span>localhost</span>
      <Separator />
      <span>127.0.0.1</span>
      <Separator />
      <span>local.*</span>
      {sites.map((site) => (
        <Fragment key={site}>
          <Separator />
          <span
            data-testid="site-chip"
            className="inline-flex items-center pl-1.5 text-foreground shadow-[inset_0_0_0_1px_var(--line-strong)]"
          >
            {site}
            <button
              type="button"
              title={`Turn off for ${site}`}
              onClick={() => removeSite(site, tab)}
              className="px-[5px] text-body leading-[1.4] text-t50 hover:text-foreground"
            >
              ×
            </button>
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function Separator() {
  return <i className="text-[7px] not-italic text-[rgba(255,255,255,0.45)]">■</i>;
}
