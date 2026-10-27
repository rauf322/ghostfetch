// Preserve: whether the requests from before a page load stay in the log when the page reloads.
// One setting for the editor, remembered in this browser.
const PRESERVE = 'ghostfetch.preserveLog';

export const isPreserved = () => localStorage.getItem(PRESERVE) === '1';
export const rememberPreserve = (on: boolean) =>
  localStorage.setItem(PRESERVE, on ? '1' : '0');
