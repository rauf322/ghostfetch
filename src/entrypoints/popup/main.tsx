// Toolbar popup: quick switches, plus shortcuts into the full editor.
import { CSPProvider } from '@base-ui/react/csp-provider';
import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { initState } from '../../lib/state.ts';
import { Popup } from './popup.tsx';
import '../../assets/kit.css';

// The side panel must be opened synchronously inside the click, so look the window up first.
const { id: windowId } = await chrome.windows.getCurrent();
const [activeTab] = await chrome.tabs.query({ active: true, windowId });
await initState();

// Drawn at once, so the popup opens at its full size.
const root = createRoot(document.getElementById('root')!);
flushSync(() => {
  root.render(
    <StrictMode>
      <CSPProvider disableStyleElements>
        <Popup windowId={windowId!} activeTab={activeTab} />
      </CSPProvider>
    </StrictMode>,
  );
});
