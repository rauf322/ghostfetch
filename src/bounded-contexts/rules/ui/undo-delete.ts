// The latest delete of a rule or a group, offered for undoing where the eye is, after T3 Code's
// undo notice (SidebarThreadUndoNotice.tsx, showThreadUndoNotice.ts): in the editor's sidebar
// footer while that's on screen, for about five seconds ("Rule deleted", undo-notice.tsx), and
// with ⌘Z (Ctrl+Z elsewhere) for as long as it shows, from anywhere a field, the body editor or a
// menu doesn't have the keyboard. A new delete takes its place and starts the time over.
//
// The five seconds wait for the user, as Base UI's toasts do (ToastViewport.js): they stop while
// the pointer is on the notice, while it has focus from the keyboard, and while the window doesn't
// have focus, and then go on from where they were. If the footer leaves the screen while the
// notice shows (⌘B, or a narrow panel opening a rule), the undo goes on in a toast with Undo, for
// the time it had left. Where the footer isn't on screen as the delete is made (a narrow panel's
// open rule, which takes the sidebar's place, or the sidebar hidden), it's a toast with Undo from
// the start, and an older notice goes, so ⌘Z can't undo that one instead.
//
// Undoing puts it back where it was, as the toast's Undo does, and gives focus to its row in the
// list (a group's, its header), with its ring. The agent's deletes keep their own toasts
// (src/bounded-contexts/agent-access/application/agent-tools.ts): they aren't where the eye is.
import { createStore } from '../../../lib/index.ts';
import { modPressed, pressedLetter } from '../../../ui/kit/kbd.tsx';
import { notify } from '../../../ui/kit/toast.tsx';

// How long the notice stays, while nothing holds it.
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

// Where the notice is said in the footer, while that's on the page (undo-notice.tsx), and what
// sees the footer leave the screen; and how many notices there have been.
let footer: HTMLElement | null = null;
let watcher: ResizeObserver | undefined;
let shown = 0;

// The notice's time: what it has left, since when that's been running (null while it isn't), and
// what holds it: the pointer on it, focus in it from the keyboard, the window without focus. And
// whether focus is in it at all, from the keyboard or not.
type Hold = 'pointer' | 'focus' | 'window';
const holds = new Set<Hold>();
let left = NOTICE_FOR;
let since: number | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let focusIn = false;

export function setUndoFooter(element: HTMLElement | null) {
  footer = element;
  watcher?.disconnect();
  watcher = undefined;
  const pane = element?.closest('aside');
  if (!pane) return;
  // The sidebar sliding shut and a narrow panel's list put away (displayed none) both take the
  // pane the footer is in to no width inside its border. The footer's own width keeps its
  // padding, and the sidebar is unseen only a frame or so after its width stops changing.
  watcher = new ResizeObserver(() => {
    if (state.notice && !footerShown()) toToast();
  });
  watcher.observe(pane);
}

// On screen: drawn, in a pane with some width inside its border (a hidden sidebar's has none once
// it's slid shut: only its hairline is left).
const footerShown = () =>
  Boolean(
    footer?.checkVisibility({ visibilityProperty: true }) &&
    (footer.closest('aside')?.clientWidth ?? 0) > 0,
  );

const timeLeft = () => (since === null ? left : left - (performance.now() - since));

function run() {
  if (!state.notice || since !== null || holds.size) return;
  since = performance.now();
  timer = setTimeout(() => dismiss(true), Math.max(left, 0));
}

function stop() {
  if (since === null) return;
  clearTimeout(timer);
  left = timeLeft();
  since = null;
}

function hold(why: Hold) {
  holds.add(why);
  stop();
}

function release(why: Hold) {
  holds.delete(why);
  run();
}

// The pointer on the notice, or off it.
export function pointerOnNotice(on: boolean) {
  if (on) hold('pointer');
  else release('pointer');
}

// Focus come into the notice (the element that has it), or gone out of it (null). It holds the
// time only where it came from the keyboard, as Base UI's toasts have it: a click on its Undo
// undoes at once, and a click anywhere else in it takes no focus.
export function focusInNotice(element: Element | null) {
  focusIn = Boolean(element);
  if (element?.matches(':focus-visible')) hold('focus');
  else release('focus');
}

// Called with the rule or group just deleted, before anything else changes the screen (the open
// rule closing): in a narrow panel the list, and its footer, only come back then, and the toast
// is where the delete was made.
export function offerUndo(deleted: Deleted) {
  if (!footerShown()) {
    dismiss(false);
    notify(deleted.toast, { icon: 'trash', action: 'Undo', onAction: deleted.undo });
    return;
  }
  clearTimeout(timer);
  since = null;
  left = NOTICE_FOR;
  shown += 1;
  state.notice = { ...deleted, number: shown };
  undoStore.emit();
  run();
}

// The notice goes. Focus in it as it does (where its time ran out, focus there without a key) goes
// to the list's Tab stop, when `moveFocus`: undoing gives it to the row put back instead.
function dismiss(moveFocus: boolean) {
  clearTimeout(timer);
  since = null;
  holds.delete('pointer');
  holds.delete('focus');
  const hadFocus = focusIn;
  focusIn = false;
  if (!state.notice) return;
  state.notice = null;
  undoStore.emit();
  if (!moveFocus || !hadFocus) return;
  requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    document
      .querySelector<HTMLElement>(`${TREE} [role="treeitem"][tabindex="0"]`)
      ?.focus();
  });
}

// The footer gone from the screen while the notice shows: the undo goes on in a toast with Undo,
// for the time the notice had left.
function toToast() {
  const { notice } = state;
  if (!notice) return;
  const time = timeLeft();
  dismiss(true);
  notify(notice.toast, {
    icon: 'trash',
    action: 'Undo',
    onAction: notice.undo,
    duration: Math.max(time, 1000),
  });
}

const TREE = '[role="tree"][data-entries]';

// The notice's Undo, and ⌘Z: the delete undone, and focus on its row once that's drawn. Where it
// isn't (a search, or a folded group, keeps it out of sight) focus stays, or if it was on the
// notice's Undo, now gone, goes to the list. The row shows its ring, as one a key moved to does:
// ⌘Z is a key the browser doesn't count for that (one with ⌘ held), and the notice's Undo, which
// the pointer can press, gives the row focus the user didn't move there.
export function undoDelete() {
  const { notice } = state;
  if (!notice) return;
  dismiss(false);
  notice.undo();
  requestAnimationFrame(() => {
    const tree = document.querySelector(TREE);
    const row = tree?.querySelector<HTMLElement>(
      `[role="treeitem"][data-item="${CSS.escape(notice.item)}"]`,
    );
    const lost = !document.activeElement || document.activeElement === document.body;
    (row ?? (lost ? tree?.querySelector<HTMLElement>('[tabindex="0"]') : null))?.focus({
      focusVisible: true,
    });
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
// last edit wherever that was made, mustn't act too, nor on the key's repeats while it's held. Z is
// the letter typed on a Latin layout, and the key where QWERTY has Z on a layout of another script
// (pressedLetter()). And the window's focus, without which the notice's time waits. Returns what
// stops it listening.
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
      modPressed(event) && !event.altKey && !event.shiftKey && pressedLetter(event, 'z');
    const target = event.target instanceof Element ? event.target : null;
    if (!undo || target?.closest(OWN_UNDO) || !footerShown()) return;
    event.preventDefault();
    event.stopPropagation();
    held = event.code;
    undoDelete();
  }
  // The window's own focus going and coming, not an element's in it.
  const onBlur = (event: FocusEvent) => {
    if (event.target === window) hold('window');
  };
  const onFocus = (event: FocusEvent) => {
    if (event.target === window) release('window');
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
  };
}
