// The toolbar popup: the master switch, Ghostfetch on this tab's site, the sites it runs on,
// recording, and a switch for every rule. A rule's name opens it in the editor.
import { Fragment } from 'react';
import { TYPES, ruleStore, ruleTitle, touchRule } from '../../../entities/rule/index.ts';
import { setFlag, settingsStore } from '../../../entities/settings/index.ts';
import {
  isBuiltInHost,
  isSiteEnabled,
  siteCovers,
  siteOf,
  setSites,
  siteStore,
} from '../../../entities/site/index.ts';
import { MasterSwitch } from '../../../features/master-switch/index.ts';
import { openSidePanel } from '../../../shared/lib/browser/index.ts';
import { cn } from '../../../shared/lib/class-names/index.ts';
import { useStore } from '../../../shared/lib/react/index.ts';
import { Badge } from '../../../shared/ui/kit/badge.tsx';
import { Button } from '../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../shared/ui/kit/icon.tsx';
import { Label } from '../../../shared/ui/kit/label.tsx';
import { Switch } from '../../../shared/ui/kit/switch.tsx';
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
  const currentHost = siteOf(activeTab?.url);
  const builtIn = isBuiltInHost(currentHost);
  const enabledHere = isSiteEnabled(sites, activeTab?.url);
  const active = rules.filter((rule) => rule.enabled).length;
  // While Ghostfetch is off, what it would do is dimmed.
  const dimmed = !enabled && 'opacity-55';

  // After the content scripts are re-registered, reload the tab so the change applies to it.
  async function updateSites(next: string[]) {
    await setSites(next);
    if (currentHost) chrome.tabs.reload(activeTab!.id!);
  }

  function removeSite(site: string) {
    const remaining = siteStore.state.sites.filter((candidate) => candidate !== site);
    if (currentHost && siteCovers(site, currentHost)) updateSites(remaining);
    else setSites(remaining);
  }

  function openPanel() {
    openSidePanel(windowId).then(() => window.close());
  }

  function openRule(id: string) {
    chrome.storage.session.set({ focusRule: id });
    openPanel();
  }

  return (
    <>
      <header className="flex h-11 items-stretch border-b border-border">
        <img
          src="/icons/icon32.png"
          width={18}
          height={18}
          alt=""
          className="ml-3.5 self-center"
        />
        <strong className="flex items-center pr-3 pl-[9px] text-small font-bold uppercase tracking-[0.08em] text-t80">
          Ghostfetch
        </strong>
        <MasterSwitch
          title="Turn Ghostfetch on or off"
          className="ml-auto border-l border-border"
        />
      </header>

      {currentHost && (
        <div
          className={cn(
            'flex items-center justify-between gap-3 border-b border-border bg-dots-strong px-3.5 py-4',
            dimmed,
          )}
        >
          <div className="min-w-0">
            <Label className="block">{enabledHere ? 'Active on' : 'Not active on'}</Label>
            <div className="mt-[5px] mb-[3px] truncate text-hero font-medium tracking-[0.01em] text-white">
              {currentHost}
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
              updateSites(
                on
                  ? [...siteStore.state.sites, currentHost]
                  : siteStore.state.sites.filter(
                      (site) => !siteCovers(site, currentHost),
                    ),
              )
            }
          />
        </div>
      )}

      {/* The sites Ghostfetch runs on, as a ticker line */}
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
                onClick={() => removeSite(site)}
                className="px-[5px] text-body leading-[1.4] text-t50 hover:text-foreground"
              >
                ×
              </button>
            </span>
          </Fragment>
        ))}
      </div>

      <div
        className={cn(
          'flex items-center justify-between border-b border-border px-3.5 py-[11px] text-control uppercase tracking-wider text-t65',
          dimmed,
        )}
      >
        <span>Record traffic</span>
        <Switch
          size="sm"
          checked={record}
          onCheckedChange={(on) => setFlag('record', on)}
          aria-label="Record traffic"
        />
      </div>

      <div className="flex h-[34px] items-center justify-between border-b border-border px-3.5 text-label uppercase tracking-label text-t40">
        <span>Rules</span>
        <span className="tracking-wider">
          {rules.length ? `${active} / ${rules.length} on` : ''}
        </span>
      </div>
      <ul className={cn('max-h-[300px] overflow-auto scroll-thin', dimmed)}>
        {rules.map((rule) => (
          <li
            key={rule.id}
            data-testid="popup-rule"
            className="flex items-center gap-[11px] border-b border-line-soft px-3.5 py-2 hover:bg-hover"
          >
            <Switch
              size="sm"
              checked={rule.enabled}
              aria-label={`Turn “${ruleTitle(rule)}” on or off`}
              onCheckedChange={(on) => {
                rule.enabled = on;
                touchRule(rule, { immediate: true });
              }}
            />
            <button
              type="button"
              title="Edit this rule"
              onClick={() => openRule(rule.id)}
              className={cn(
                'min-w-0 flex-1 truncate text-left hover:underline hover:decoration-t40 hover:underline-offset-3',
                rule.enabled ? 'text-foreground' : 'text-t40',
              )}
            >
              {ruleTitle(rule)}
            </button>
            <Badge className="text-t30">{TYPES[rule.type].short}</Badge>
          </li>
        ))}
      </ul>
      {!rules.length && (
        <p className="p-3.5 text-small text-t40">
          No rules yet. Open the editor to create one.
        </p>
      )}

      <footer className="grid grid-cols-2 border-t border-border">
        <Button
          onClick={openPanel}
          className="h-11 border-0 bg-transparent tracking-[0.2em] text-white"
        >
          Side panel <Icon name="arrow" size={13} />
        </Button>
        <Button
          onClick={() => {
            chrome.runtime.openOptionsPage();
            window.close();
          }}
          className="h-11 border-0 border-l border-border bg-transparent tracking-[0.2em] text-t40"
        >
          Open in tab <Icon name="external" size={13} />
        </Button>
      </footer>
    </>
  );
}

function Separator() {
  return <i className="text-[7px] not-italic text-[rgba(255,255,255,0.45)]">■</i>;
}
