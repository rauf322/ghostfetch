// The site of the tab the popup opened on: whether Ghostfetch runs there and why, and a switch that
// turns it on or off there. Nothing for a page that isn't a website.
import {
  isBuiltInHost,
  isSiteEnabled,
  siteOf,
  turnOffFor,
  turnOnFor,
} from '../../../shared/api/index.ts';
import { cn } from '../../../shared/ui/cn.ts';
import { Label } from '../../../shared/ui/kit/label.tsx';
import { Switch } from '../../../shared/ui/kit/switch.tsx';

export function CurrentSite({
  tab,
  sites,
  dimmed,
}: {
  tab: chrome.tabs.Tab | undefined;
  // The sites you added.
  sites: string[];
  dimmed: boolean;
}) {
  const host = siteOf(tab?.url);
  if (!host) return null;
  const builtIn = isBuiltInHost(host);
  const enabledHere = isSiteEnabled(sites, tab?.url);
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-border bg-dots-strong px-3.5 py-4',
        dimmed && 'opacity-55',
      )}
    >
      <div className="min-w-0">
        <Label className="block">{enabledHere ? 'Active on' : 'Not active on'}</Label>
        <div className="mt-[5px] mb-[3px] truncate text-hero font-medium tracking-[0.01em] text-white">
          {host}
        </div>
        <div className="text-label uppercase tracking-wide text-t40">
          {builtIn
            ? 'Always on · built-in host'
            : enabledHere
              ? 'A site you added'
              : 'Switch on to mock requests here'}
        </div>
      </div>
      {/* Built-in hosts are always on, so their switch can't be turned off. */}
      <Switch
        checked={enabledHere}
        disabled={builtIn}
        title={
          builtIn
            ? 'Ghostfetch always runs on localhost, 127.0.0.1 and local.* sites'
            : 'Turn Ghostfetch on or off for this site'
        }
        onCheckedChange={(on) =>
          on ? turnOnFor(host, tab!.id!) : turnOffFor(host, tab!.id!)
        }
      />
    </div>
  );
}
