// The latest delete of a rule or a group, offered for undoing where the eye is, after T3 Code's
// undo notice (SidebarThreadUndoNotice.tsx, showThreadUndoNotice.ts): in the editor's sidebar
// footer while that's on screen, for about five seconds ("Rule deleted", undo-notice.tsx), and
// with ⌘Z (Ctrl+Z elsewhere) for as long as it shows, from anywhere a field, the body editor or a
// menu doesn't have the keyboard. A new delete takes its place and starts the time over. Where the footer isn't on screen as the delete is made (a narrow panel's open
// rule, which takes the sidebar's place, or the sidebar hidden), a toast with Undo, as before.
// Undoing puts it back where it was, as the toast's Undo does, and gives focus to its row in the
// list (a group's, its header). The agent's deletes keep their own toasts (agent-tools.ts): they
// aren't where the eye is.
import { createStore } from '../../../lib/index.ts';
import { modPressed } from '../../../ui/kit/kbd.tsx';
import { notify } from '../../../ui/kit/toast.tsx';

// How long the notice stays.
const NOTICE_FOR = 5000;

export interface Deleted {
  // What the footer says: "Rule deleted", "Group deleted".
  said: string;
  // What the toast says where there's no footer: "Deleted “Users list”".
  toast: string;
  // The rule's or the group's id, for its row to have focus once it's back.
  item: string;
  undo: () => void;
}

// The notice, with its number, for each to be read out once.
const state: { notice: (Deleted & { number: number }) | null } = { notice: null };
export const undoStore = /* @__PURE__ */ createStore(state);

// Where the notice is said in the footer, while that's on the page (undo-notice.tsx); how many
// notices there have been; and the time the one now has left.
let footer: HTMLElement | null = null;
let shown = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

export function setUndoFooter(element: HTMLElement | null) {
  footer = element;
}

const footerShown = () => Boolean(footer?.checkVisibility({ visibilityProperty: true }));

// Called with the rule or group just deleted, before anything else changes the screen (the open
// rule closing): in a narrow panel the list, and its footer, only come back then, and the toast
// is where the delete was made.
export function offerUndo(deleted: Deleted) {
  if (!footerShown()) {
    notify(deleted.toast, { icon: 'trash', action: 'Undo', onAction: deleted.undo });
    return;
  }
  clearTimeout(timer);
  shown += 1;
  state.notice = { ...deleted, number: shown };
  undoStore.emit();
  timer = setTimeout(dismiss, NOTICE_FOR);
}

function dismiss() {
  clearTimeout(timer);
  if (!state.notice) return;
  state.notice = null;
  undoStore.emit();
}

const TREE = '[role="tree"][data-entries]';

// The notice's Undo, and ⌘Z: the delete undone, and focus on its row once that's drawn. Where it
// isn't (a search, or a folded group, keeps it out of sight) focus stays, or if it was on the
// notice's Undo, now gone, goes to the list.
export function undoDelete() {
  const { notice } = state;
  if (!notice) return;
  dismiss();
  notice.undo();
  requestAnimationFrame(() => {
    const tree = document.querySelector(TREE);
    const row = tree?.querySelector<HTMLElement>(
      `[role="treeitem"][data-item="${CSS.escape(notice.item)}"]`,
    );
    const lost = !document.activeElement || document.activeElement === document.body;
    (row ?? (lost ? tree?.querySelector<HTMLElement>('[tabindex="0"]') : null))?.focus();
  });
}

// What has an undo of its own, or keys of its own, while it has the keyboard: a field (the search,
// a name being renamed, a rule's settings), the body editor and Diff's panes (vim's u too), as T3
// Code has them (editableFocus.ts); and a menu or a list of options. ⌘Z is theirs there.
const OWN_UNDO = [
  'input',
  'textarea',
  'select',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]',
  '[role="menu"]',
  '[role="listbox"]',
].join(',');
// Keys that, tapped while ⌘Z is held, leave it held, as it goes on repeating.
const MODIFIERS = new Set([
  'Meta',
  'Control',
  'Alt',
  'AltGraph',
  'Shift',
  'CapsLock',
  'Fn',
]);

// The editor's one listener for ⌘Z (app/sidepanel/sidebar.tsx), on its window before anything
// else has the key: while the notice is on screen, ⌘Z undoes the delete it's for, whatever was
// pressed or clicked before, unless what has the keyboard has its own (OWN_UNDO), as T3 Code has
// it outside text fields. It takes the key: the browser's own undo, which takes back the page's
// last edit wherever that was made, mustn't act too, nor on the key's repeats while it's held.
// Returns what stops it listening.
export function listenForUndoKey() {
  // The key whose press undid, while it's held.
  let held: string | null = null;
  function onKeyDown(event: KeyboardEvent) {
    if (event.repeat) {
      if (event.code === held) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (!MODIFIERS.has(event.key)) held = null;
    if (!state.notice) return;
    const undo =
      modPressed(event) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'z';
    const target = event.target instanceof Element ? event.target : null;
    if (!undo || target?.closest(OWN_UNDO) || !footerShown()) return;
    event.preventDefault();
    event.stopPropagation();
    held = event.code;
    undoDelete();
  }
  window.addEventListener('keydown', onKeyDown, true);
  return () => window.removeEventListener('keydown', onKeyDown, true);
}
