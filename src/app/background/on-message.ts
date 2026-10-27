// The messages the background answers (app/messaging): an iframe's traffic log entry, passed on to
// its tab's top frame, and the popup's or the editor's request to sync at once.
import type { RuntimeMessage } from '../messaging/messages.ts';
import { scheduleSync } from './schedule-sync.ts';

export function onMessage(
  message: RuntimeMessage | undefined,
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
