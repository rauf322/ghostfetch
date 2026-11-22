// Agent access for as long as the editor is open: the connection to ghostfetch-mcp, while it's on,
// doing what the agent's tools ask with the editor's log of the page it watches, and the kit's
// toast for the Undo of what the agent deletes.
import { useEffect } from 'react';
import type { TrafficLog } from '../../traffic/index.ts';
import { notify } from '../../ui/kit/toast.tsx';
import { startAgentAccess } from '../infrastructure/agent-connection.ts';
import { createAgentTools, runAgentTool } from '../application/agent-tools.ts';

export function useAgentAccess({ log, inTab }: { log: TrafficLog; inTab: boolean }) {
  useEffect(() => {
    const firefox = navigator.userAgent.includes('Firefox/');
    const place = inTab ? 'a tab' : firefox ? "Firefox's sidebar" : "Chrome's side panel";
    const tools = createAgentTools({ log, place, notify });
    return startAgentAccess((method, params) => runAgentTool(tools, method, params), {
      browser: firefox ? 'Firefox' : 'Chrome',
      editor: place,
      version: chrome.runtime.getManifest().version,
    });
  }, [log, inTab]);
}
