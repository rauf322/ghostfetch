// Entry point of the full editor, shown in Chrome's side panel, Firefox's sidebar or its own tab.
import { CSPProvider } from '@base-ui/react/csp-provider';
import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { initRules } from '../../entities/rule/index.ts';
import { initSettings } from '../../entities/settings/index.ts';
import { initSites } from '../../entities/site/index.ts';
import { Toaster } from '../../shared/ui/kit/toast.tsx';
import { Editor } from './editor.tsx';
import '../styles/kit.css';

// The editor's own settings (the Vim switch, Preserve, and the tab it last showed) were saved
// under "mocktail." names up to 0.6.0. They move to their "ghostfetch." names once.
for (const name of ['vim', 'view', 'preserveLog']) {
  const saved = localStorage.getItem(`mocktail.${name}`);
  if (saved === null) continue;
  if (localStorage.getItem(`ghostfetch.${name}`) === null)
    localStorage.setItem(`ghostfetch.${name}`, saved);
  localStorage.removeItem(`mocktail.${name}`);
}

await Promise.all([initSettings(), initSites(), initRules()]);
const inTab = Boolean(await chrome.tabs.getCurrent());
const { id: windowId } = await chrome.windows.getCurrent();

const root = createRoot(document.getElementById('root')!);
flushSync(() => {
  root.render(
    <StrictMode>
      <CSPProvider disableStyleElements>
        <Toaster>
          <Editor inTab={inTab} windowId={windowId!} />
        </Toaster>
      </CSPProvider>
    </StrictMode>,
  );
});
