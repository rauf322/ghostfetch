// What the list says about the page it watches, when there's something to say: that there's no
// web page open, that Ghostfetch is off on the page's site (with a button that turns it on), that
// it isn't running in the tab yet (with one that reloads the page), or that recording is off.
import type { ReactNode } from 'react';
import {
  isSiteEnabled,
  normalizeSite,
  siteOf,
  turnOnFor,
} from '../../../shared/api/index.ts';
import { Alert } from '../../../shared/ui/kit/alert.tsx';
import { Button } from '../../../shared/ui/kit/button.tsx';
import type { TrafficSnapshot } from '../model/traffic-log.ts';

export function TrafficNotice({
  traffic,
  sites,
  record,
}: {
  traffic: TrafficSnapshot;
  // The sites you added, and whether requests are recorded.
  sites: string[];
  record: boolean;
}) {
  const { targetId, targetUrl } = traffic;
  const host = siteOf(targetUrl);
  let notice: ReactNode = null;
  if (targetId == null) {
    notice = 'Open a web page in this window to see its requests.';
  } else if (!traffic.connected && host && !isSiteEnabled(sites, targetUrl)) {
    notice = (
      <>
        Ghostfetch is off on <b>{host}</b>
        {", so it doesn't capture or change anything there. "}
        <Button
          variant="link"
          size="inline"
          data-testid="enable-site"
          onClick={() => {
            const site = normalizeSite(host);
            if (site) turnOnFor(site, targetId);
          }}
        >
          {`Turn on for ${host}`}
        </Button>
      </>
    );
  } else if (!traffic.connecting && !traffic.connected) {
    notice = (
      <>
        {
          "Ghostfetch isn't running in this tab yet. That happens when the page was opened before Ghostfetch was installed or turned on for this site. "
        }
        <Button variant="link" size="inline" onClick={() => chrome.tabs.reload(targetId)}>
          Reload the page
        </Button>
      </>
    );
  } else if (!record) {
    notice = 'Recording is off, so new requests aren’t captured. Rules still apply.';
  }

  if (!notice) return null;
  return (
    <Alert data-testid="traffic-notice" className="mx-3.5 mt-2.5 flex-none">
      {notice}
    </Alert>
  );
}
