// Toolbar popup: quick switches, plus shortcuts into the full editor.
import { CSPProvider } from '@base-ui/react/csp-provider';
import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { PopupPage } from './ui/popup-page.tsx';
import { initPaused, initRules } from '../../bounded-contexts/rules/index.ts';
import { initSites } from '../../bounded-contexts/sites/index.ts';
import { initRecording } from '../../bounded-contexts/traffic/index.ts';
import '../styles/kit.css';

// The side panel must be opened synchronously inside the click, so look the window up first.
const { id: windowId } = await chrome.windows.getCurrent();
const [activeTab] = await chrome.tabs.query({ active: true, windowId });
await Promise.all([initPaused(), initRecording(), initSites(), initRules()]);

// Drawn at once, so the popup opens at its full size.
const root = createRoot(document.getElementById('root')!);
flushSync(() => {
  root.render(
    <StrictMode>
      <CSPProvider disableStyleElements>
        <PopupPage windowId={windowId!} activeTab={activeTab} />
      </CSPProvider>
    </StrictMode>,
  );
});
