// Agent access for as long as the editor is open: the connection to ghostfetch-mcp, while it's on,
// doing what the agent's tools ask with the editor's log of the page it watches.
import { useEffect } from 'react';
import type { TrafficLog } from '../../../shared/api/index.ts';
import { startAgentAccess } from './agent-connection.ts';
import { createAgentTools, runAgentTool } from './agent-tools.ts';

export function useAgentAccess({ log, inTab }: { log: TrafficLog; inTab: boolean }) {
  useEffect(() => {
    const firefox = navigator.userAgent.includes('Firefox/');
    const place = inTab ? 'a tab' : firefox ? "Firefox's sidebar" : "Chrome's side panel";
    const tools = createAgentTools({ log, place });
    return startAgentAccess((method, params) => runAgentTool(tools, method, params), {
      browser: firefox ? 'Firefox' : 'Chrome',
      editor: place,
      version: chrome.runtime.getManifest().version,
    });
  }, [log, inTab]);
}
