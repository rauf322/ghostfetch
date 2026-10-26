// The UI kit page: every component of src/components/ui/ in its states, to look at while working on
// the kit (`npm run dev`, then open kit.html) and for test/kit.mjs. Built only for those two, never
// into the extension you install (see wxt.config.ts).
import { CSPProvider } from '@base-ui/react/csp-provider';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from '../../components/ui/toast.tsx';
import { Sheet } from './sheet.tsx';
import '../../assets/kit.css';

// For test/kit.mjs: every CSP violation on this page, recorded from the start, so a component that
// adds a <style> tag as it mounts is caught too.
const violations: string[] = [];
document.addEventListener('securitypolicyviolation', (event) => {
  violations.push(
    `${event.violatedDirective}: ${event.blockedURI || 'inline'} ${event.sample || ''}`.trim(),
  );
});
Object.assign(window, { kitViolations: violations });

// The test's two self-checks, each of which must cause a violation: ?canary adds a <style> tag on
// purpose, and ?csp=off lets Base UI add its own (every page built on the kit turns that off).
const params = new URLSearchParams(location.search);
if (params.has('canary'))
  document.head.append(
    Object.assign(document.createElement('style'), {
      textContent: 'body { outline: 0; }',
    }),
  );

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CSPProvider disableStyleElements={params.get('csp') !== 'off'}>
      <Toaster>
        <main className="p-6">
          <header className="mb-5 flex items-center gap-3">
            <img src="/icons/icon32.png" width={20} height={20} alt="" />
            <h1 className="text-title font-medium text-foreground">Ghostfetch UI kit</h1>
            <span className="text-meta text-t40">
              src/components/ui · every component, in its states
            </span>
          </header>
          <Sheet open={params.has('open')} />
        </main>
      </Toaster>
    </CSPProvider>
  </StrictMode>,
);

document.fonts.ready.then(() =>
  requestAnimationFrame(() => (document.body.dataset.ready = '1')),
);
