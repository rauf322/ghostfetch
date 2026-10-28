// Ghostfetch's two switches, as the editor and the popup show them: on or off (enabled), and
// whether requests are recorded for Traffic. Changes made in another view arrive through
// chrome.storage.onChanged; the screens redraw through useStore(settingsStore).
import { createStore } from '../lib/index.ts';

export interface Settings {
  enabled: boolean;
  record: boolean;
}

const state: Settings = { enabled: true, record: true };
export const settingsStore = /* @__PURE__ */ createStore(state);

export async function initSettings() {
  const stored = (await chrome.storage.local.get({
    enabled: true,
    record: true,
  })) as Settings;
  state.enabled = stored.enabled;
  state.record = stored.record;
  chrome.storage.onChanged.addListener((changed, area) => {
    if (area !== 'local' || !(changed.enabled || changed.record)) return;
    if (changed.enabled) state.enabled = (changed.enabled.newValue as boolean) ?? true;
    if (changed.record) state.record = (changed.record.newValue as boolean) ?? true;
    settingsStore.emit();
  });
}

export function setFlag(key: keyof Settings, value: boolean) {
  state[key] = value;
  chrome.storage.local.set({ [key]: value });
  settingsStore.emit();
}
