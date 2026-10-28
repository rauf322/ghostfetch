// Entry point of the full editor, shown in Chrome's side panel, Firefox's sidebar or its own tab.
import { CSPProvider } from '@base-ui/react/csp-provider';
import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { initRules, initSettings, initSites } from '../../shared/api/index.ts';
import { Toaster } from '../../shared/ui/kit/toast.tsx';
import { Editor } from './editor.tsx';
import { moveLegacySettings } from './legacy-settings.ts';
import '../styles/kit.css';

moveLegacySettings();
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
