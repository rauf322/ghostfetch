// The editor's sidebar (app/sidepanel/sidebar.tsx) beside what's open, from 760px wide. Drag its
// edge (SidebarHandle) to make it wider or narrower, on past its narrowest to hide it, and back
// out to show it again; double-click the edge for its usual width. The button at the top left of
// what's open (SidebarToggle), or Cmd/Ctrl+B, hides and shows it too. Whether it's hidden and its
// width are remembered in this browser (localStorage). A narrow side panel shows the sidebar or
// what's open, one at a time, so neither the edge nor the button is there.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { cn } from './cn.ts';
import { Button } from './kit/button.tsx';
import { Icon } from './kit/icon.tsx';

// While it shows, the sidebar is at least this wide, and leaves what's open at least this much
// room.
const MIN_LIST = 260;
const MIN_OPEN = 320;
// How far an arrow key moves the edge (with Shift, four times as far).
const STEP = 16;

const HIDDEN_KEY = 'ghostfetch.sidebar';
const WIDTH_KEY = 'ghostfetch.sidebar-width';
// Up to 0.16.2 each tab's list had a width of its own; the Rules tab's is the sidebar's now
// (app/sidepanel/legacy-settings.ts moves it over, after this file has read it).
const OLD_WIDTH_KEY = 'ghostfetch.sidebar-width.rules';

function savedWidth() {
  const width = Number(
    localStorage.getItem(WIDTH_KEY) ?? localStorage.getItem(OLD_WIDTH_KEY),
  );
  return width > 0 ? width : null;
}

let hidden = localStorage.getItem(HIDDEN_KEY) === 'hidden';
// The width its edge was dragged to, in px, or null for its usual one (ListPane's
// --list-default).
let dragged = savedWidth();
// Whether its edge is being dragged.
let dragging = false;
const listeners = new Set<() => void>();

function changed() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setHidden(next: boolean) {
  if (next === hidden) return;
  hidden = next;
  if (hidden) localStorage.setItem(HIDDEN_KEY, 'hidden');
  else localStorage.removeItem(HIDDEN_KEY);
  changed();
}

// `remember`: false while the edge is being dragged; it's remembered once it's let go.
function setWidth(width: number | null, remember = true) {
  if (dragged !== width) {
    dragged = width;
    changed();
  }
  if (!remember) return;
  if (width === null) localStorage.removeItem(WIDTH_KEY);
  else localStorage.setItem(WIDTH_KEY, String(width));
}

function setDragging(next: boolean) {
  dragging = next;
  changed();
}

export const useSidebarHidden = () => useSyncExternalStore(subscribe, () => hidden);

// The sidebar's width, for its ListPane: the width it was dragged to, as --list-width (kept
// between MIN_LIST and what leaves MIN_OPEN for what's open, however wide the window gets), and
// whether its edge is being dragged, while it follows the pointer instead of sliding.
export function useListColumn() {
  const width = useSyncExternalStore(subscribe, () => dragged);
  const resizing = useSyncExternalStore(subscribe, () => dragging);
  const style =
    width === null
      ? undefined
      : ({
          '--list-width': `clamp(${MIN_LIST}px, ${width}px, 100% - ${MIN_OPEN}px)`,
        } as CSSProperties);
  return { style, resizing };
}

// ⌘B on a Mac and Ctrl+B elsewhere, as code editors have it.
const MAC = /Mac/.test(navigator.userAgent);
const SHORTCUT = MAC ? '⌘B' : 'Ctrl+B';

export function SidebarToggle({ className }: { className?: string }) {
  const isHidden = useSidebarHidden();
  const button = useRef<HTMLButtonElement>(null);

  // Only a button on screen answers the keys, as both views stay mounted and a narrow panel hides
  // the button; and not a key something else has already handled (defaultPrevented).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!mod || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'b')
        return;
      if (event.defaultPrevented || !button.current?.checkVisibility()) return;
      event.preventDefault();
      if (!event.repeat) setHidden(!hidden);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const label = isHidden ? 'Show the sidebar' : 'Hide the sidebar';
  return (
    <Button
      ref={button}
      variant="ghost"
      size="icon"
      data-testid="sidebar-toggle"
      aria-label={label}
      aria-expanded={!isHidden}
      title={`${label} (${SHORTCUT})`}
      onClick={() => setHidden(!hidden)}
      className={cn('flex-none max-wide:hidden', className)}
    >
      <Icon name="sidebar" size={18} />
    </Button>
  );
}

// While the edge is dragged (and while the sidebar slides, ListPane), an element in the Split
// marked data-keep-width keeps the width it had, and takes its new one when the edge is let go:
// the body editor's text area, whose lines don't wrap, so its width changes nothing on screen,
// but laying a long body out again on every frame made the drag stutter. Returns what it holds,
// for releaseWidths().
export function holdWidths(split: HTMLElement) {
  const held = [...split.querySelectorAll<HTMLElement>('[data-keep-width]')];
  // Measured first, then set, so it's laid out once.
  const kept = held.map((element) => element.getBoundingClientRect().width);
  held.forEach((element, index) => {
    element.style.width = `${kept[index]}px`;
  });
  return held;
}

export function releaseWidths(held: HTMLElement[]) {
  for (const element of held) element.style.width = '';
}

// For a SidebarHandle (`handle`, in the Split of the sidebar with the id `list`): the Split's
// left side and its width, and the sidebar's width and the widest it can be.
function measure(handle: HTMLElement, list: string) {
  const split = handle.parentElement!.getBoundingClientRect();
  const shown = document.getElementById(list)?.getBoundingClientRect().width ?? 0;
  return {
    left: split.left,
    room: split.width,
    now: hidden ? 0 : Math.round(shown),
    max: Math.max(MIN_LIST, Math.floor(split.width - MIN_OPEN)),
  };
}

// The sidebar's edge, over the line between it and what's open (`list`: the sidebar's id), and
// between the two in a Split. Drag it to make the sidebar wider or narrower, on past half its
// narrowest to hide it, and back out to show it; double-click it for the usual width. With the
// sidebar hidden it waits at the left edge. It's a separator in the Tab order too: the arrow keys
// move it, Home and End to the narrowest and the widest, and Enter hides or shows the sidebar.
export function SidebarHandle({ list }: { list: string }) {
  const isHidden = useSidebarHidden();
  const isDragging = useSyncExternalStore(subscribe, () => dragging);
  const handle = useRef<HTMLDivElement>(null);
  // Where the drag started: how far right of the edge it was taken, the Split's left side and
  // width, the width to go back to if it ends with the sidebar hidden, and what keeps its width
  // until it ends (holdWidths()).
  const drag = useRef<{
    offset: number;
    left: number;
    room: number;
    before: number | null;
    held: HTMLElement[];
  } | null>(null);
  // The sidebar's width and the widest it can be now, for screen readers.
  const [size, setSize] = useState<{ now: number; max: number } | null>(null);

  // Measured again whenever the sidebar or the Split changes size: a drag, the sidebar sliding
  // shut or open, the window.
  useEffect(() => {
    const element = handle.current!;
    const observer = new ResizeObserver(() => {
      const { now, max } = measure(element, list);
      setSize((was) => (was?.now === now && was.max === max ? was : { now, max }));
    });
    observer.observe(element.parentElement!);
    const listPane = document.getElementById(list);
    if (listPane) observer.observe(listPane);
    return () => {
      observer.disconnect();
      // Gone in the middle of a drag: it's over.
      if (drag.current) {
        releaseWidths(drag.current.held);
        drag.current = null;
        setDragging(false);
      }
    };
  }, [list]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const { left, room, now } = measure(event.currentTarget, list);
    drag.current = {
      offset: event.clientX - (left + now),
      left,
      room,
      before: dragged,
      held: holdWidths(event.currentTarget.parentElement!),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const from = drag.current;
    if (!from) return;
    const wanted = event.clientX - from.offset - from.left;
    if (wanted < MIN_LIST / 2) {
      setWidth(from.before, false);
      setHidden(true);
      return;
    }
    setHidden(false);
    const widest = Math.max(MIN_LIST, from.room - MIN_OPEN);
    setWidth(Math.round(Math.min(Math.max(wanted, MIN_LIST), widest)), false);
  }

  function onPointerEnd() {
    if (!drag.current) return;
    releaseWidths(drag.current.held);
    drag.current = null;
    setWidth(dragged);
    setDragging(false);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const { now, max } = measure(event.currentTarget, list);
    // From where the last key put it, rather than where it has slid to so far.
    const from = Math.min(dragged ?? now, max);
    const step = event.shiftKey ? STEP * 4 : STEP;
    const to = (width: number) => {
      setHidden(false);
      setWidth(Math.min(Math.max(width, MIN_LIST), max));
    };
    if (event.key === 'ArrowLeft') {
      if (!isHidden) to(from - step);
    } else if (event.key === 'ArrowRight') {
      if (isHidden) setHidden(false);
      else to(from + step);
    } else if (event.key === 'Home') to(MIN_LIST);
    else if (event.key === 'End') to(max);
    else if (event.key === 'Enter') setHidden(!isHidden);
    else return;
    event.preventDefault();
  }

  const now = isHidden ? 0 : size?.now;
  return (
    <>
      <div
        ref={handle}
        // A window splitter: a separator that takes focus and the pointer, and says where it is
        // (aria-value*). The linter would have an <hr>, which it then won't let do either.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- it's a splitter widget
        role="separator"
        aria-orientation="vertical"
        aria-label="Sidebar width"
        aria-controls={list}
        aria-valuemin={0}
        aria-valuemax={size?.max}
        aria-valuenow={now}
        aria-valuetext={isHidden ? 'Hidden' : now === undefined ? undefined : `${now} px`}
        tabIndex={0}
        data-testid="sidebar-handle"
        data-collapsed={isHidden || undefined}
        data-dragging={isDragging || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
        onDoubleClick={() => {
          setHidden(false);
          setWidth(null);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          // 8 px across the line, over 4 px of each side of it, and taking no room in the row;
          // with the sidebar hidden, the 8 px from the left edge.
          'relative z-10 -mx-1 w-2 flex-none cursor-col-resize touch-none outline-none select-none max-wide:hidden data-collapsed:ml-0 data-collapsed:-mr-2 data-collapsed:cursor-e-resize',
          // Its line: the sidebar's own hairline, wider and brighter under the pointer (after a
          // moment, so passing over it doesn't flash it), while it's dragged, and with focus.
          "after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:transition-colors after:duration-150 after:content-[''] hover:after:bg-t30 hover:after:delay-150 focus-visible:after:bg-t65 data-dragging:after:bg-t50",
        )}
      />
      {/* While it's dragged, the resize cursor everywhere, and nothing else under the pointer
          lights up. */}
      {isDragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </>
  );
}
