// The toolbar popup: the master switch, Ghostfetch on this tab's site, the sites it runs on,
// recording, and a switch for every rule. A rule's name opens it in the editor.
import { ruleStore } from '../../../entities/rule/index.ts';
import { settingsStore } from '../../../entities/settings/index.ts';
import { siteStore } from '../../../entities/site/index.ts';
import { useStore } from '../../../shared/lib/react/index.ts';
import { CurrentSite } from './current-site.tsx';
import { PopupFooter } from './popup-footer.tsx';
import { PopupHeader } from './popup-header.tsx';
import { PopupRules } from './popup-rules.tsx';
import { RecordSwitch } from './record-switch.tsx';
import { SiteList } from './site-list.tsx';

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
  // While Ghostfetch is off, what it would do is dimmed.
  const dimmed = !enabled;

  return (
    <>
      <PopupHeader />
      <CurrentSite tab={activeTab} sites={sites} dimmed={dimmed} />
      <SiteList sites={sites} tab={activeTab} />
      <RecordSwitch record={record} dimmed={dimmed} />
      <PopupRules rules={rules} windowId={windowId} dimmed={dimmed} />
      <PopupFooter windowId={windowId} />
    </>
  );
}
