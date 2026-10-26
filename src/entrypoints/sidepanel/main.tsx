// Entry point of the full editor, shown in Chrome's side panel, Firefox's sidebar or its own tab.
import { CSPProvider } from '@base-ui/react/csp-provider';
import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Toaster } from '../../components/ui/toast.tsx';
import { initState } from '../../lib/state.ts';
import { App } from './app.tsx';
import '../../assets/kit.css';

await initState();
const inTab = Boolean(await chrome.tabs.getCurrent());
const { id: windowId } = await chrome.windows.getCurrent();

const root = createRoot(document.getElementById('root')!);
flushSync(() => {
  root.render(
    <StrictMode>
      <CSPProvider disableStyleElements>
        <Toaster>
          <App inTab={inTab} windowId={windowId!} />
        </Toaster>
      </CSPProvider>
    </StrictMode>,
  );
});
