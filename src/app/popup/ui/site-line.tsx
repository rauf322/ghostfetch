// Ghostfetch on the tab's page, in one line: the page's host, whether Ghostfetch is on there, and
// on the right why it is (a built-in host always is) or the button that turns it off there (a
// site you added). The host, where it's short of room (Commit Mono at Larger), is cut in its
// middle, so its port stays. A tab that isn't on a website gets a few words for that.
import { isBuiltInHost, turnOffFor } from '../../../bounded-contexts/sites/index.ts';
import { cn } from '../../../ui/cn.ts';
import { MiddleTruncate } from '../../../ui/kit/middle-truncate.tsx';
import { Tooltip } from '../../../ui/kit/tooltip.tsx';

export function SiteLine({
  tab,
  host,
  runsHere,
  enabled,
}: {
  tab: chrome.tabs.Tab | undefined;
  // The tab's hostname, '' when it isn't on a website.
  host: string;
  runsHere: boolean;
  enabled: boolean;
}) {
  if (!host || !tab?.url || tab.id === undefined)
    return (
      <p data-testid="site-line" className="px-0.5 text-label text-t50">
        No website in this tab
      </p>
    );
  const tabId = tab.id;
  const live = runsHere && enabled;
  return (
    <div data-testid="site-line" className="flex min-w-0 items-center gap-2 px-0.5">
      <span
        aria-hidden
        className={cn(
          'size-1.5 flex-none rounded-full',
          live
            ? 'animate-signal-pulse bg-signal'
            : runsHere
              ? 'bg-t40'
              : 'border border-t40',
        )}
      />
      {/* With its port, as the address bar has it: localhost:5173. */}
      <MiddleTruncate
        text={new URL(tab.url).host}
        className="font-mono text-title font-semibold text-strong"
      />
      <span className={cn('flex-none text-label', live ? 'text-signal' : 'text-t50')}>
        {!runsHere ? 'off here' : enabled ? 'on here' : 'paused'}
      </span>
      {runsHere &&
        (isBuiltInHost(host) ? (
          <Tooltip label="Ghostfetch always runs on localhost, 127.0.0.1 and local.* sites">
            <span className="ml-auto flex-none text-label text-t40">Always on</span>
          </Tooltip>
        ) : (
          <Tooltip label={`Turn Ghostfetch off on ${host}; the page reloads`}>
            <button
              type="button"
              data-testid="turn-off-here"
              onClick={() => turnOffFor(host, tabId)}
              className="ml-auto flex-none text-label text-t50 hover:text-foreground"
            >
              Turn off here
            </button>
          </Tooltip>
        ))}
    </div>
  );
}
