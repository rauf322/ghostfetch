// Right-click menus: the menus' card (dropdown-menu.tsx) at the pointer, over the elements in its
// trigger, which its items are about (the trigger's onContextMenu says which, from the event's
// target, before it opens). Base UI's, with its items, submenus and keys: the arrows move, Enter
// runs an item, Esc closes it. From the keyboard, the ContextMenu key or Shift+F10 opens it at the
// bottom left of what has focus, on the key's release (as VS Code's lists do, and T3 Code's). A
// right-click in a text field, or on text selected in the trigger, gets the browser's own menu
// (Copy, Paste, the spelling), and the trigger's onContextMenu doesn't hear it.
import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';
import { createContext, useContext, useMemo, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { cn } from '../cn.ts';
import { MENU_POPUP } from './dropdown-menu.tsx';

// What had focus in the trigger as the menu opened (a row the keys are on), which gets it back as
// the menu shuts: Base UI's own choice would be the trigger's first control. Not where an item has
// put focus elsewhere meanwhile (a field it opened), nor where it's gone (an item deleted it),
// which is the page's to see to.
const CameFrom = createContext<{
  note: (element: HTMLElement | null) => void;
  read: () => HTMLElement | null;
} | null>(null);

export function ContextMenu(props: ContextMenuPrimitive.Root.Props) {
  const cameFrom = useRef<HTMLElement | null>(null);
  const value = useMemo(
    () => ({
      note: (element: HTMLElement | null) => {
        cameFrom.current = element;
      },
      read: () => cameFrom.current,
    }),
    [],
  );
  return (
    <CameFrom.Provider value={value}>
      <ContextMenuPrimitive.Root {...props} />
    </CameFrom.Provider>
  );
}

const FIELD = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

// The ContextMenu key alone, or Shift+F10.
const isMenuKey = (event: KeyboardEvent) =>
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey));

// Opens the menu for `element` at its bottom left, as a right-click there would: at its own part
// marked data-menu-anchor's, where it has one (a group's header, the group being its rules too).
export function openContextMenuAt(element: HTMLElement) {
  const box = (
    element.querySelector<HTMLElement>(':scope > [data-menu-anchor]') ?? element
  ).getBoundingClientRect();
  element.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: box.left,
      clientY: box.bottom,
    }),
  );
}

export function ContextMenuTrigger({
  onContextMenu,
  onKeyDown,
  onKeyUp,
  ...props
}: ContextMenuPrimitive.Trigger.Props) {
  // What had focus as the menu key went down: the menu opens for it as the key comes up.
  const pressed = useRef<HTMLElement | null>(null);
  const cameFrom = useContext(CameFrom);
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      onContextMenu={(event) => {
        const target = event.target as Element;
        const selection = getSelection();
        if (
          target.closest(FIELD) ||
          (selection?.rangeCount &&
            !selection.isCollapsed &&
            selection.getRangeAt(0).intersectsNode(target) &&
            event.currentTarget.contains(selection.anchorNode))
        ) {
          // Neither Base UI's handler nor its listener on the document, which would keep the
          // browser's menu from showing.
          event.preventBaseUIHandler();
          event.stopPropagation();
          return;
        }
        const active = document.activeElement;
        cameFrom?.note(
          active instanceof HTMLElement && event.currentTarget.contains(active)
            ? active
            : null,
        );
        onContextMenu?.(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || !isMenuKey(event)) return;
        event.preventDefault();
        pressed.current = event.target as HTMLElement;
      }}
      onKeyUp={(event) => {
        onKeyUp?.(event);
        const target = pressed.current;
        if (!target || (event.key !== 'ContextMenu' && event.key !== 'F10')) return;
        pressed.current = null;
        event.preventDefault();
        if (document.activeElement === target && target.isConnected)
          openContextMenuAt(target);
      }}
      {...props}
    />
  );
}

export function ContextMenuContent({
  className,
  ...props
}: ContextMenuPrimitive.Popup.Props) {
  const cameFrom = useContext(CameFrom);
  const popup = useRef<HTMLDivElement>(null);
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner className="isolate z-50 outline-none">
        <ContextMenuPrimitive.Popup
          ref={popup}
          data-slot="context-menu-content"
          finalFocus={() => {
            const active = document.activeElement;
            if (active && active !== document.body && !popup.current?.contains(active))
              return false;
            const element = cameFrom?.read();
            return element?.isConnected ? element : false;
          }}
          className={cn(MENU_POPUP, className)}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}
