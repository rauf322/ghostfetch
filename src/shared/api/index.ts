// Ghostfetch's two switches, as the editor and the popup show them and chrome.storage keeps them:
// on or off (enabled), and whether requests are recorded for Traffic (settings.ts). The rules are
// src/rules/'s. No React and no npm package.
export { initSettings, setFlag, settingsStore } from './settings.ts';
export type { Settings } from './settings.ts';
