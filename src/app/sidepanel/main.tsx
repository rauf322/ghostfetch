// Entry point of the full editor, shown in Chrome's side panel, Firefox's sidebar or its own tab.
import { CSPProvider } from '@base-ui/react/csp-provider';
import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  initPaused,
  initRules,
  initServerResponses,
} from '../../bounded-contexts/rules/index.ts';
import { initSites } from '../../bounded-contexts/sites/index.ts';
import { initRecording } from '../../bounded-contexts/traffic/index.ts';
import { Toaster } from '../../ui/kit/toast.tsx';
import { TooltipProvider } from '../../ui/kit/tooltip.tsx';
import { Editor } from './editor.tsx';
import { moveLegacySettings } from './legacy-settings.ts';
import '../styles/kit.css';

moveLegacySettings();
await Promise.all([initPaused(), initRecording(), initSites(), initRules()]);
// After the rules: it drops the responses of rules that are gone.
await initServerResponses();
const inTab = Boolean(await chrome.tabs.getCurrent());
const { id: windowId } = await chrome.windows.getCurrent();

const root = createRoot(document.getElementById('root')!);
flushSync(() => {
  root.render(
    <StrictMode>
      <CSPProvider disableStyleElements>
        <TooltipProvider>
          <Toaster>
            <Editor inTab={inTab} windowId={windowId!} />
          </Toaster>
        </TooltipProvider>
      </CSPProvider>
    </StrictMode>,
  );
});
