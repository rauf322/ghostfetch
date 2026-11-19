// The system clipboard as the body editor's vim reads it for p: the shape only. The extension's
// pages read it through shared/api's systemClipboard (with the permission it takes); the editor's
// engine, which knows nothing of the extension, gets it from the page.

// What p read: the clipboard's text, or why there's none: `declined` (the browser was told not to
// let Ghostfetch read it, just now), `unread` (the browser didn't give it), `again` (allowed a
// moment ago, but not given yet: Chrome reads only into a focused page, and its dialog took the
// focus).
export type ClipboardRead =
  | { text: string }
  | { problem: 'declined' | 'unread' | 'again' };

export interface SystemClipboard {
  // Reads the clipboard once `after` (a yank's write to it) is done, asking for the browser's leave
  // first if need be; null where p shouldn't read it (and puts vim's register).
  read(after?: Promise<unknown>): Promise<ClipboardRead> | null;
  // Asks for the browser's leave again (vim's :set clipboard=unnamedplus): whether it's given.
  ask(): Promise<boolean> | null;
  // Stops reading it (:set clipboard=), and doesn't ask again.
  forget(): void;
}
