// The Sites tab: where Ghostfetch runs. The built-in hosts, always on, then the sites you added,
// each with Remove, which turns Ghostfetch off there (the tab reloads if it shows that site).
import { removeSite } from '../../../sites/index.ts';
import { Icon } from '../../../ui/kit/icon.tsx';

// As the manifest's content scripts have them (wxt.config.ts); localhost covers *.localhost too.
export const BUILT_IN_HOSTS = ['localhost', '127.0.0.1', 'local.*'];

export function SitesTab({
  sites,
  tab,
}: {
  // The sites you added.
  sites: string[];
  // The tab the popup opened on, which reloads if a site that covers it goes.
  tab: chrome.tabs.Tab | undefined;
}) {
  return (
    <div className="max-h-[368px] overflow-y-auto rounded-lg bg-card p-1 scroll-thin">
      {BUILT_IN_HOSTS.map((host) => (
        <div key={host} className="flex h-9 items-center gap-2 px-3">
          <Icon name="globe" size={13} className="text-t40" />
          <span className="truncate font-mono text-meta text-t80">{host}</span>
          <span className="ml-auto flex-none text-label text-t40">Always on</span>
        </div>
      ))}
      {sites.map((site) => (
        <div
          key={site}
          data-testid="added-site"
          className="flex h-9 items-center gap-2 rounded-md px-3 hover:bg-hover"
        >
          <Icon name="globe" size={13} className="text-t40" />
          <span className="truncate font-mono text-meta text-foreground">{site}</span>
          <button
            type="button"
            title={`Turn off for ${site}`}
            onClick={() => removeSite(site, tab)}
            className="ml-auto flex-none text-label text-t50 hover:text-foreground"
          >
            Remove
          </button>
        </div>
      ))}
      <p className="px-3 pt-1 pb-2 text-meta text-t40">
        {sites.length
          ? 'A site covers its subdomains too.'
          : 'To add a site, open this popup on one of its pages and turn Ghostfetch on there.'}
      </p>
    </div>
  );
}
