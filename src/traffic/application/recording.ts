// Recording (docs/glossary/traffic.md): whether requests are added to traffic logs, as the editor
// and the popup show it; the popup's Recording changes it. Storage keeps it as `record` (recording
// while nothing is stored), which each page's bridge reads for itself to tell its tab's log.
// Changes made in another view arrive through chrome.storage.onChanged; the screens redraw
// through useStore(recordingStore).
import { createStore } from '../../lib/index.ts';

const state = { recording: true };
export const recordingStore = /* @__PURE__ */ createStore(state);

export async function initRecording() {
  const stored = (await chrome.storage.local.get({ record: true })) as {
    record: boolean;
  };
  state.recording = stored.record;
  chrome.storage.onChanged.addListener((changed, area) => {
    if (area !== 'local' || !changed.record) return;
    state.recording = (changed.record.newValue as boolean) ?? true;
    recordingStore.emit();
  });
}

export function setRecording(recording: boolean) {
  state.recording = recording;
  chrome.storage.local.set({ record: recording });
  recordingStore.emit();
}
