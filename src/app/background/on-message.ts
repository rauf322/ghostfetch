// The messages the background answers: an iframe's traffic log entry, passed on to its tab's top
// frame, and the popup's or the editor's request to sync at once. Each context says what its own
// messages are (src/traffic/contract.ts, src/sites/contract.ts), and the union of the ones that
// come here is put together here. (The popup asks a tab's top frame what each rule did there,
// Traffic's CountsMessage, with chrome.tabs.sendMessage, which never reaches the background.)
import type { SyncMessage } from '../../sites/index.ts';
import type { FrameEntryMessage } from '../../traffic/index.ts';
import { scheduleSync } from './schedule-sync.ts';

// What the extension's own parts send the background with chrome.runtime.sendMessage.
type BackgroundMessage =
  // The popup or editor to the background: re-register the content scripts now.
  | SyncMessage
  // An iframe's bridge to the background, which passes it on to the tab's top frame.
  | FrameEntryMessage;

export function onMessage(
  message: BackgroundMessage | undefined,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: boolean) => void,
) {
  // Requests made inside iframes are reported by that frame's bridge; pass them on to the
  // top frame, which owns the tab's traffic log.
  if (message?.type === 'ghostfetch:frameEntry' && sender.tab && sender.frameId) {
    chrome.tabs.sendMessage(sender.tab.id!, message, { frameId: 0 }).catch(() => {});
  }
  // The popup or editor turns a site on or off, then waits for this before reloading the tab.
  if (message?.type === 'ghostfetch:sync' && !sender.tab) {
    scheduleSync().then(() => sendResponse(true));
    return true;
  }
  return undefined;
}
