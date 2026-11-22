// Brings the browser in line with what's stored: the content scripts for the sites you added
// (src/bounded-contexts/sites/content-scripts.ts) and the toolbar badge
// (src/bounded-contexts/rules/infrastructure/badge.ts).
import { updateBadge } from '../../bounded-contexts/rules/index.ts';
import { syncContentScripts } from '../../bounded-contexts/sites/index.ts';
import { loadState } from './stored-state.ts';

// Storage changes can arrive in bursts while typing; run syncs one at a time so
// overlapping register/update calls never collide.
let queue = Promise.resolve();
export function scheduleSync({ scripts = true } = {}) {
  queue = queue
    .then(async () => {
      const state = await loadState();
      if (scripts) await syncContentScripts(state);
      updateBadge(state.enabled, state.rules, state.off);
    })
    .catch((error) => console.error('[Ghostfetch] sync failed', error));
  return queue;
}
