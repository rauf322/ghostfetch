// The system clipboard, for the body editor's vim keys: p pastes what you copied, there or in
// another app. Reading it takes the optional clipboardRead permission (wxt.config.ts), which
// Ghostfetch asks for the first time p wants it rather than when it's installed, so no one who
// doesn't paste with vim keys is asked: the browser's own dialog ("Read data you copy and paste").
// Turned down, it isn't asked for again, and p puts what was yanked in the editor instead, until
// vim's :set clipboard=unnamedplus asks again (or Firefox's add-on settings grant it).
//
// A browser only lets a page ask for a permission while it handles a key press or a click, and
// Firefox not even after an await, so read() and ask() ask first, before anything else, while vim
// handles the key. The shape (SystemClipboard, ClipboardRead) is src/lib's, which the editor's
// engine knows; this is Rules', as only a rule's body editor reads the clipboard.
import type { ClipboardRead, SystemClipboard } from '../../../lib/index.ts';

const PERMISSION: chrome.permissions.Permissions = { permissions: ['clipboardRead'] };
// Set once the permission was turned down (or given back), so p doesn't ask every time.
const DECLINED_KEY = 'ghostfetch.clipboard';
// Whether this page has answered `again`, which it does once: where the browser never gives the
// clipboard, p has to go on putting the yank.
let saidAgain = false;
// Whether this page has looked whether a permission turned down was granted since.
let looked = false;

// The extension's permissions API, where the page is the extension's and can read the clipboard.
const permissions = () =>
  globalThis.chrome?.permissions && navigator.clipboard ? chrome.permissions : null;

// Reads the clipboard, once `after` is done. Chrome gives it only to a page that has the focus,
// which the dialog it asked with has just taken: that read fails and the next p's won't, so it
// answers `again`. A read that fails with the focus here (Chrome 121, which doesn't let an
// extension read with the permission; a clipboard the browser is told to keep to itself) answers
// `unread`, and p puts the yank: answered `again` as well, p would put nothing there, ever.
function readText(after: Promise<unknown>): Promise<ClipboardRead> {
  return after
    .catch(() => {})
    .then(() => {
      const focused = document.hasFocus();
      return navigator.clipboard.readText().then(
        (text): ClipboardRead => ({ text }),
        (): ClipboardRead => {
          if (focused || saidAgain) return { problem: 'unread' };
          saidAgain = true;
          return { problem: 'again' };
        },
      );
    });
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
