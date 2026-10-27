// Brings the browser in line with what's stored: the content scripts for the sites you added
// (content-scripts.ts), and the redirect, header and block rules (dnr-rules.ts).
import { syncContentScripts } from './content-scripts.ts';
import { syncRules } from './dnr-rules.ts';
import { loadState } from './stored-state.ts';

// Storage changes can arrive in bursts while typing; run syncs one at a time so
// overlapping register/update calls never collide.
let queue = Promise.resolve();
export function scheduleSync(what = { scripts: true, rules: true }) {
  queue = queue
    .then(async () => {
      const state = await loadState();
      if (what.scripts) await syncContentScripts(state);
      if (what.rules) await syncRules(state);
    })
    .catch((error) => console.error('[Ghostfetch] sync failed', error));
  return queue;
}
