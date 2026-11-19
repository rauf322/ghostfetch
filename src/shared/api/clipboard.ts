// The system clipboard, for the body editor's vim keys: p pastes what you copied, there or in
// another app. Reading it takes the optional clipboardRead permission (wxt.config.ts), which
// Ghostfetch asks for the first time p wants it rather than when it's installed, so no one who
// doesn't paste with vim keys is asked: the browser's own dialog ("Read data you copy and paste").
// Turned down, it isn't asked for again, and p puts what was yanked in the editor instead, until
// vim's :set clipboard=unnamedplus asks again (or Firefox's add-on settings grant it).
//
// A browser only lets a page ask for a permission while it handles a key press or a click, and
// Firefox not even after an await, so read() and ask() ask first, before anything else, while vim
// handles the key. The shape (SystemClipboard, ClipboardRead) is shared/lib's, which the editor's
// engine knows too.
import type { ClipboardRead, SystemClipboard } from '../lib/index.ts';

const PERMISSION: chrome.permissions.Permissions = { permissions: ['clipboardRead'] };
// Set once the permission was turned down (or given back), so p doesn't ask every time.
const DECLINED_KEY = 'ghostfetch.clipboard';
// Whether this page has read the clipboard since it opened: a read that fails before that may be
// the one right after the dialog, which took the focus.
let readHere = false;
// Whether this page has looked whether a permission turned down was granted since.
let looked = false;

// The extension's permissions API, where the page is the extension's and can read the clipboard.
const permissions = () =>
  globalThis.chrome?.permissions && navigator.clipboard ? chrome.permissions : null;

function readText(after: Promise<unknown>): Promise<ClipboardRead> {
  return after
    .catch(() => {})
    .then(() => navigator.clipboard.readText())
    .then(
      (text) => {
        readHere = true;
        return { text };
      },
      () => ({ problem: readHere ? 'unread' : 'again' }),
    );
}

function ask(): Promise<boolean> | null {
  const api = permissions();
  if (!api) return null;
  return api.request(PERMISSION).then(
    (granted) => {
      if (granted) localStorage.removeItem(DECLINED_KEY);
      else localStorage.setItem(DECLINED_KEY, '1');
      return granted;
    },
    () => false,
  );
}

export const systemClipboard: SystemClipboard = {
  read(after = Promise.resolve()) {
    const api = permissions();
    if (!api) return null;
    if (localStorage.getItem(DECLINED_KEY)) {
      // Turned down: p puts what was yanked. Should it have been granted since (Firefox's add-on
      // settings can), the next p reads the clipboard again.
      if (!looked) {
        looked = true;
        api.contains(PERMISSION).then(
          (granted) => granted && localStorage.removeItem(DECLINED_KEY),
          () => {},
        );
      }
      return null;
    }
    // Once it's granted, the browser says yes at once, without a dialog.
    return ask()!.then((granted) =>
      granted ? readText(after) : { problem: 'declined' },
    );
  },
  ask,
  forget() {
    localStorage.setItem(DECLINED_KEY, '1');
    permissions()
      ?.remove(PERMISSION)
      .catch(() => {});
  },
};
