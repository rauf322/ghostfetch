// Paused (docs/glossary/rules.md): Ghostfetch as a whole turned off, so no rule answers, whatever
// its switches say, as the editor and the popup show it; the popup's Pause and Resume change it.
// Storage keeps it the other way up, as whether Ghostfetch is on (`enabled`, on while nothing is
// stored), which the bridge and the background read for themselves. Changes made in another view
// arrive through chrome.storage.onChanged; the screens redraw through useStore(pausedStore).
import { createStore } from '../../lib/index.ts';

const state = { paused: false };
export const pausedStore = /* @__PURE__ */ createStore(state);

export async function initPaused() {
  const stored = (await chrome.storage.local.get({ enabled: true })) as {
    enabled: boolean;
  };
  state.paused = !stored.enabled;
  chrome.storage.onChanged.addListener((changed, area) => {
    if (area !== 'local' || !changed.enabled) return;
    state.paused = !((changed.enabled.newValue as boolean) ?? true);
    pausedStore.emit();
  });
}

export function setPaused(paused: boolean) {
  state.paused = paused;
  chrome.storage.local.set({ enabled: !paused });
  pausedStore.emit();
}
