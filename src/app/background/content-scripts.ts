// The sites you added get their content scripts registered at runtime, so they only ever run
// on those sites; every other site never sees Ghostfetch. The files are the same two the
// manifest declares for the built-in hosts.
import { siteMatchPatterns } from '../../shared/api/index.ts';
import type { StoredState } from './stored-state.ts';

const SCRIPT_IDS = ['ghostfetch-interceptor', 'ghostfetch-bridge'];

export async function syncContentScripts({ sites }: StoredState) {
  // Every script registered so far, whatever its id: up to 0.6.0 they were "mocktail-interceptor"
  // and "mocktail-bridge", which would otherwise outlive the update and keep running on sites
  // you've since turned off.
  const registered = await chrome.scripting.getRegisteredContentScripts();
  if (registered.length)
    await chrome.scripting.unregisterContentScripts({
      ids: registered.map((script) => script.id),
    });
  if (!sites.length) return;
  const matches = siteMatchPatterns(sites);
  await chrome.scripting.registerContentScripts([
    {
      id: SCRIPT_IDS[0]!,
      js: ['interceptor.js'],
      matches,
      runAt: 'document_start',
      allFrames: true,
      world: 'MAIN',
    },
    {
      id: SCRIPT_IDS[1]!,
      js: ['bridge.js'],
      matches,
      runAt: 'document_start',
      allFrames: true,
    },
  ]);
}
