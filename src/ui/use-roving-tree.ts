// One Tab stop for a list of rows and the keys that move in it, after ARIA's tree view (a list with
// no groups is a tree of one level): the editor's rule list, the popup's and Traffic's. It knows
// nothing of what the rows are. An item is an element in the list with `data-item`, its id, and
// `data-kind`, what it is in the list's own words, which the list goes by (never a test id). It
// takes the focus itself, or by a part of it (`focusIn`: a request's button). The list draws the
// item whose id is `stop` with tabIndex 0, and the others with -1.
//
// - The Tab stop: the item focus is in, or else `open` (the open rule or request), or else the one
//   focused last, or else the first.
// - ↑ ↓ move between the items as they're drawn (a folded group's aren't), Home and End to the
//   first and the last, each scrolled into sight. In a tree (`onFold`), → unfolds a group (one with
//   aria-expanded) or goes to its first item, and ← folds it or goes from an item to its group. The
//   list's own keys, Enter, Space or F2, are `onKey`'s. The keys are an item's alone: none with a
//   modifier held, nor from a control or a field in it.
// - A right-click on an item, or the ContextMenu key or Shift+F10 on it (kit/context-menu.tsx),
//   opens its menu where `onMenu` says it has one, the item marked `data-context-open` while the
//   menu is open; anywhere else in the list, the browser's own.
// - Focus given back where it would fall to the page: once a menu opened from an item with focus
//   in it shuts, to the item (`back`); and from an item the list draws again elsewhere, a new
//   element for it, to the new one (`follow`).
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, MouseEvent } from 'react';

const ITEM = '[data-kind]';

export interface TreeItem {
  element: HTMLElement;
  id: string;
  kind: string;
  // Unfolded or not (aria-expanded), for an item that folds.
  expanded: boolean | undefined;
}

export interface RovingTreeOptions {
  // The items' ids in the order they're drawn, for the Tab stop.
  ids: readonly string[];
  open?: string | null;
  // The part of an item that takes the focus for it, where the item itself doesn't.
  focusIn?: string;
  // A tree's: an item folded (shut) or unfolded.
  onFold?: (item: TreeItem, shut: boolean) => void;
  // The list's own keys on an item: true where it took the key, whose default is then prevented.
  onKey?: (event: KeyboardEvent<HTMLElement>, item: TreeItem) => boolean;
  // A right-click on an item: true where it has a menu, which the list then shows for it.
  onMenu?: (item: TreeItem) => boolean;
  // The mark on the item whose menu is open is set on the element right-clicked, or, `drawnMark`,
  // drawn by the list on its items from `menuOpen`, on any element it draws for the item.
  drawnMark?: boolean;
  // Back from a menu: to the item it was opened from, or, 'or next', where that's gone, to the
  // one in its place.
  back?: 'item' | 'or next';
  // Focus in an item the list draws again elsewhere follows it, heard after each draw of the list
  // ('draw'), or as the browser reports focus leaving an element it takes away ('blur': Chromium
  // does, Firefox doesn't; that hears a part an item draws again itself too).
  follow?: 'draw' | 'blur';
  // How focus is given back: with the ring it had as it went to an item last (`ring`), and
  // without scrolling the item into sight (`still`).
  refocus?: { ring?: boolean; still?: boolean };
}

// The item `node` is in, within `list`.
function itemOf(list: HTMLElement | null, node: EventTarget | null): TreeItem | null {
  const element = node instanceof Element ? node.closest<HTMLElement>(ITEM) : null;
  const id = element?.dataset.item;
  if (!element || !id || !list?.contains(element)) return null;
  const expanded = element.getAttribute('aria-expanded');
  return {
    element,
    id,
    kind: element.dataset.kind ?? '',
    expanded: expanded === null ? undefined : expanded === 'true',
  };
}

// An item by its id, in `within`: a list, or a view with one in it.
export function findItem(within: ParentNode | null | undefined, id: string) {
  return (
    within?.querySelector<HTMLElement>(`${ITEM}[data-item="${CSS.escape(id)}"]`) ?? null
  );
}

// What takes the focus for an item: the item, or its part `focusIn`.
const focusTarget = (item: Element | null | undefined, focusIn: string | undefined) =>
  (item && focusIn ? item.querySelector<HTMLElement>(focusIn) : (item as HTMLElement)) ??
  null;

export function useRovingTree({
  ids,
  open = null,
  focusIn,
  onFold,
  onKey,
  onMenu,
  drawnMark = false,
  back,
  follow,
  refocus,
}: RovingTreeOptions) {
  const list = useRef<HTMLElement | null>(null);
  // The item focus is in now (null while it's outside the list), and the one it was in last.
  const [focused, setFocused] = useState<string | null>(null);
  const [lastFocused, setLastFocused] = useState<string | null>(null);
  // Whether the right-click menu is open, for a list that draws its mark (`drawnMark`).
  const [menuOpen, setMenuOpen] = useState(false);
  // Whether focus showed its ring as it went to an item last; that item, as it was drawn then; the
  // element marked as having the menu open; and the item a menu was opened from, with focus in
  // it, with where it was among the items.
  const ring = useRef(false);
  const held = useRef<{ id: string; element: HTMLElement } | null>(null);
  const marked = useRef<HTMLElement | null>(null);
  const menuFrom = useRef<{ id: string; index: number } | null>(null);
  const withRing = refocus?.ring ?? false;
  const still = refocus?.still ?? false;

  const stop =
    [focused, open, lastFocused].find((id) => id !== null && ids.includes(id)) ??
    ids[0] ??
    null;

  const refocusWith = useCallback(
    (ringThen: boolean): FocusOptions => ({
      ...(withRing && { focusVisible: ringThen }),
      ...(still && { preventScroll: true }),
    }),
    [withRing, still],
  );

  // The list's element, and while focus follows by 'blur', the listener for it. Heard on the
  // element itself: React passes no handler of its own the blur of an element it's taking away.
  const ref = useCallback(
    (element: HTMLElement | null) => {
      list.current = element;
      if (!element || follow !== 'blur') return undefined;
      function onFocusOut(event: globalThis.FocusEvent) {
        if (element!.contains(event.relatedTarget as Node | null)) return;
        const left = event.target as HTMLElement;
        const id = itemOf(element, left)?.id;
        const ringThen = ring.current;
        if (!id) return;
        // Once the list is drawn, before it's painted.
        queueMicrotask(() => {
          if (left.isConnected) return;
          if (document.activeElement && document.activeElement !== document.body) return;
          focusTarget(findItem(element, id), focusIn)?.focus(refocusWith(ringThen));
        });
      }
      element.addEventListener('focusout', onFocusOut);
      return () => {
        element.removeEventListener('focusout', onFocusOut);
        list.current = null;
      };
    },
    [follow, focusIn, refocusWith],
  );

  // While focus follows by 'draw': after each draw of the list, onto the item it was in, where
  // that's drawn again elsewhere.
  useLayoutEffect(() => {
    const was = held.current;
    if (
      follow !== 'draw' ||
      !was ||
      was.element.isConnected ||
      document.activeElement !== document.body
    )
      return;
    held.current = null;
    focusTarget(findItem(list.current, was.id), focusIn)?.focus(
      refocusWith(ring.current),
    );
  });

  const items = () => [...(list.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])];

  // An item, or where it's gone (a search hides it), the list's Tab stop.
  const focusItem = useCallback(
    (id: string) => {
      const element = findItem(list.current, id);
      (element
        ? focusTarget(element, focusIn)
        : list.current?.querySelector<HTMLElement>(
            focusIn ? `${ITEM} ${focusIn}[tabindex="0"]` : `${ITEM}[tabindex="0"]`,
          )
      )?.focus(refocusWith(ring.current));
    },
    [focusIn, refocusWith],
  );

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const item = itemOf(list.current, event.target);
    if (
      !item ||
      focusTarget(item.element, focusIn) !== event.target ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    const all = [
      ...(list.current?.querySelectorAll<HTMLElement>(
        focusIn ? `${ITEM} ${focusIn}` : ITEM,
      ) ?? []),
    ];
    const index = all.indexOf(event.target as HTMLElement);
    let to: HTMLElement | null | undefined;
    switch (event.key) {
      case 'ArrowDown':
        to = all[index + 1];
        break;
      case 'ArrowUp':
        to = all[index - 1];
        break;
      case 'Home':
        to = all[0];
        break;
      case 'End':
        to = all.at(-1);
        break;
      case 'ArrowRight':
        if (!onFold) return;
        if (item.expanded === false) onFold(item, false);
        else if (item.expanded)
          to = focusTarget(
            item.element.querySelector(`:scope > [role="group"] > ${ITEM}`),
            focusIn,
          );
        break;
      case 'ArrowLeft':
        if (!onFold) return;
        if (item.expanded) onFold(item, true);
        else to = focusTarget(item.element.parentElement?.closest(ITEM), focusIn);
        break;
      default:
        if (!onKey?.(event, item)) return;
    }
    event.preventDefault();
    if (!to) return;
    to.focus();
    to.scrollIntoView({ block: 'nearest' });
  }

  function onFocus(event: FocusEvent<HTMLElement>) {
    const item = itemOf(list.current, event.target);
    if (!item) return;
    held.current = { id: item.id, element: item.element };
    setFocused(item.id);
    ring.current = (event.target as Element).matches(':focus-visible');
  }

  // Focus gone from the list (a click elsewhere): nothing to follow there any more. An item drawn
  // again elsewhere, focus in it, says nothing of its going (see `ref`), so it's still followed.
  function onBlur(event: FocusEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    held.current = null;
    if (focused) setLastFocused(focused);
    setFocused(null);
  }

  // Where a menu is opened from: the item `element` is in, while focus is in it.
  function noteMenuFrom(element: Element | null | undefined) {
    const item = itemOf(list.current, element ?? null);
    const active = document.activeElement;
    menuFrom.current =
      item && active && item.element.contains(active)
        ? { id: item.id, index: items().indexOf(item.element) }
        : null;
  }

  // Back from the menu, which Base UI can't do where its item is gone (deleted) or drawn again
  // elsewhere (moved): not where focus went on, to a field or another view.
  function backToItem() {
    const from = menuFrom.current;
    menuFrom.current = null;
    if (!from || (document.activeElement && document.activeElement !== document.body))
      return;
    const now = items();
    const element =
      now.find((each) => each.dataset.item === from.id) ??
      (back === 'or next' ? now[Math.min(from.index, now.length - 1)] : undefined);
    focusTarget(element, focusIn)?.focus(refocusWith(ring.current));
  }
  const backOnceShut = (isOpen: boolean) => {
    if (!isOpen && back) requestAnimationFrame(backToItem);
  };

  function unmark() {
    marked.current?.removeAttribute('data-context-open');
    marked.current = null;
  }

  function onContextMenu(
    event: MouseEvent<HTMLElement> & { preventBaseUIHandler: () => void },
  ) {
    const item = itemOf(list.current, event.target);
    if (!item || !onMenu?.(item)) {
      event.preventBaseUIHandler();
      event.stopPropagation();
      return;
    }
    if (!drawnMark) {
      marked.current?.removeAttribute('data-context-open');
      item.element.setAttribute('data-context-open', '');
      marked.current = item.element;
    }
    noteMenuFrom(item.element);
  }

  return {
    ref,
    stop,
    // The list element's handlers (the ContextMenuTrigger's, which draws it).
    handlers: { onKeyDown, onFocus, onBlur, onContextMenu },
    menuOpen,
    // The list's <ContextMenu>: its item's mark off as it shuts, and focus back once it has.
    menu: {
      onOpenChange: (isOpen: boolean) => {
        if (drawnMark) setMenuOpen(isOpen);
        else if (!isOpen) unmark();
      },
      onOpenChangeComplete: backOnceShut,
    },
    // A menu an item's own control opens (a row's ⋯): focus back once it's shut.
    itemMenu: {
      onOpenChange: (isOpen: boolean, details: { trigger?: Element | null }) => {
        if (isOpen) noteMenuFrom(details.trigger);
      },
      onOpenChangeComplete: backOnceShut,
    },
    focusItem,
    itemAt: (node: EventTarget | null) => itemOf(list.current, node),
    itemById: (id: string) => findItem(list.current, id),
  };
}
