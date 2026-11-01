// Brings the browser in line with what's stored: the content scripts for the sites you added
// (content-scripts.ts) and the toolbar badge (badge.ts).
import { updateBadge } from './badge.ts';
import { syncContentScripts } from './content-scripts.ts';
import { loadState } from './stored-state.ts';

// Storage changes can arrive in bursts while typing; run syncs one at a time so
// overlapping register/update calls never collide.
let queue = Promise.resolve();
export function scheduleSync({ scripts = true } = {}) {
  queue = queue
    .then(async () => {
      const state = await loadState();
      if (scripts) await syncContentScripts(state);
      updateBadge(state.enabled, state.rules);
    })
    .catch((error) => console.error('[Ghostfetch] sync failed', error));
  return queue;
}
