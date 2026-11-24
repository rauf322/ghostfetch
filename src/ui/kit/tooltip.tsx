// Tooltips that follow the theme, after T3 Code's (its idea; none of its code): what a control
// does in a few words, the key that does the same (Kbd), and why a control is off. On Base UI's
// tooltip, which adds no <style> tag: its positioner places it through the CSSOM, which the
// extension's CSP allows.
//
// It opens once the pointer has rested on the control a moment (TooltipProvider), and at once when
// the keyboard moves focus to it: Base UI opens it on focus only where that's :focus-visible, and
// not after a press, so a click doesn't open it, and a click closes it. So does a scroll, unless
// keyboard focus put it up (moving focus to a control can scroll the page to it); and while the
// page scrolls, controls passing under the pointer open none. A control that opens a menu of its
// own shows none while that's open, nor as the menu gives focus back to it (watchPopup()). It
// never takes the pointer, so what's under it can still be clicked, and it stays inside the
// window, flipping to the other side where this one has no room (the popup is 330 px wide).
//
// A screen reader hears its words as the control's description, as it heard a title, with the key
// in words (describe()); not where they're the control's name already. A description isn't a
// name: a control that's only an icon still needs its own aria-label.
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Kbd, spokenKeys } from './kbd.tsx';

// How long the pointer rests on a control before its tooltip opens: quick enough for a bar of
// icons, slow enough that passing over one on the way elsewhere doesn't flash it. Once one is
// open, moving to a neighbour opens the neighbour's at once.
const TOOLTIP_DELAY = 350;

// How long after the page last scrolled the pointer opens no tooltip. Controls moving under a
// pointer that's still aren't the pointer resting on one, and a tooltip opened then would close
// again at the next scroll, so a scroll through a list would flash them.
const SCROLL_QUIET = 200;

// When the page last scrolled, and how to close each tooltip open now (for TooltipProvider).
let scrolledAt = -Infinity;
const shown = new Set<() => void>();

function onScroll() {
  scrolledAt = performance.now();
  for (const close of shown) close();
}

// Around each page (the popup, the editor, the kit page), for its tooltips to share the wait, and
// to watch it scroll: any scroll, of the page or of a list in it, as a scroll event doesn't bubble
// but passes the window on its way to what scrolled.
export function TooltipProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, []);
  return (
    <TooltipPrimitive.Provider delay={TOOLTIP_DELAY}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

// The roles a control takes its name from its own words in, as a button does.
const NAMED_BY_WORDS = new Set([
  'button',
  'checkbox',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'switch',
  'tab',
]);

// The words in `element` a screen reader reads, those of what's aria-hidden or hidden left out:
// a button's words that show, and the ones only a screen reader gets (Keep on reload's, narrow).
function wordsOf(element: Element): string {
  let words = '';
  for (const node of element.childNodes)
    if (node.nodeType === Node.TEXT_NODE) words += node.textContent;
    else if (
      node instanceof Element &&
      node.getAttribute('aria-hidden') !== 'true' &&
      !node.hasAttribute('hidden')
    )
      words += ` ${wordsOf(node)} `;
  return words;
}

// The control's name for a screen reader, as far as a tooltip needs it: what its aria-labelledby
// points at, its aria-label, a field's label, or its own words where its role takes them.
function nameOf(control: HTMLElement) {
  const labelledBy = control.getAttribute('aria-labelledby');
  if (labelledBy)
    return labelledBy
      .split(/\s+/)
      .map((id) => control.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ');
  const label = control.getAttribute('aria-label');
  if (label?.trim()) return label;
  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement ||
    control instanceof HTMLSelectElement
  )
    return [...(control.labels ?? [])].map((each) => each.textContent).join(' ');
  const role =
    control.getAttribute('role') ??
    (control instanceof HTMLButtonElement
      ? 'button'
      : control instanceof HTMLAnchorElement && control.href
        ? 'link'
        : '');
  return NAMED_BY_WORDS.has(role) ? wordsOf(control) : '';
}

const plain = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

// Sentences one after another, each ended with a full stop unless it has a mark of its own.
const sentences = (parts: string[]) =>
  parts
    .filter(Boolean)
    .reduce(
      (text, part) => (text ? `${text}${/[.!?:]$/.test(text) ? '' : '.'} ${part}` : part),
      '',
    );

// Puts `words` in `holder` (always in the page, hidden, so a screen reader can be pointed at it
// while the tooltip is shut) and points the control's aria-describedby at it, after the ids the
// control has of its own; with no words, leaves the control only those. Done after React has drawn
// the control, as its name is only known then, and on whatever element the control is.
function describe(control: HTMLElement, holder: HTMLElement, words: string) {
  if (holder.textContent !== words) holder.textContent = words;
  const was = control.getAttribute('aria-describedby') ?? '';
  const ids = was.split(/\s+/).filter((id) => id && id !== holder.id);
  if (words) ids.push(holder.id);
  const now = ids.join(' ');
  if (now === was) return;
  if (now) control.setAttribute('aria-describedby', now);
  else control.removeAttribute('aria-describedby');
}

// Which ways its control's own popup holds the tooltip shut: the pointer's and the keyboard's.
interface Shut {
  hover: boolean;
  focus: boolean;
}

// A control that opens a popup of its own (aria-haspopup: a ⋯ menu, a select) shows no tooltip
// while that's open, nor once it's shut, when Base UI gives focus back to the control (after Esc,
// or a click outside): the pointer has to leave the control and come back, or focus leave it and
// come back (Tab), for the tooltip to show again. Returns what stops watching.
function watchPopup(control: HTMLElement, shut: Shut) {
  const popup = control.getAttribute('aria-haspopup');
  if (!popup || popup === 'false') return undefined;
  let open = control.getAttribute('aria-expanded') === 'true';
  const watch = new MutationObserver(() => {
    const now = control.getAttribute('aria-expanded') === 'true';
    if (now && !open) {
      shut.hover = true;
      shut.focus = true;
    }
    // Shut with the pointer elsewhere, which then has left already.
    else if (!now && open && !control.matches(':hover')) shut.hover = false;
    open = now;
  });
  watch.observe(control, { attributes: true, attributeFilter: ['aria-expanded'] });
  function left() {
    if (!open) shut.hover = false;
  }
  function blurred() {
    if (!open) shut.focus = false;
  }
  // Focus that lands elsewhere once the popup is shut, as on a control clicked outside it, which
  // keeps it rather than giving it back.
  function landed(event: FocusEvent) {
    if (!open && event.target !== control) shut.focus = false;
  }
  control.addEventListener('mouseleave', left);
  control.addEventListener('blur', blurred);
  document.addEventListener('focusin', landed, true);
  return () => {
    watch.disconnect();
    control.removeEventListener('mouseleave', left);
    control.removeEventListener('blur', blurred);
    document.removeEventListener('focusin', landed, true);
  };
}

export function Tooltip({
  label,
  keys,
  reason,
  side = 'top',
  children,
}: {
  label: string;
  // The key that does the same, as this platform writes it (modKey() in kbd.tsx for ⌘B).
  keys?: string;
  // Why the control is off. A control that's off takes neither the pointer nor focus, so the
  // tooltip hangs on a wrapper around it instead, which focus can reach, and says why under the
  // label.
  reason?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  // The control, which becomes the tooltip's trigger: one element that takes props and a ref,
  // as the kit's controls do.
  children: ReactElement;
}) {
  const actions = useRef<TooltipPrimitive.Root.Actions>(null);
  // The control (typed as Base UI types its trigger, though it may be a field or a span).
  const trigger = useRef<HTMLButtonElement>(null);
  const holder = useRef<HTMLSpanElement>(null);
  const id = useId();
  const shut = useRef<Shut>({ hover: false, focus: false });
  // What a scroll does to it while it's open.
  const close = useCallback(() => {
    if (!trigger.current?.matches(':focus-visible')) actions.current?.close();
  }, []);
  useEffect(
    () => () => {
      shown.delete(close);
    },
    [close],
  );
  useEffect(
    () => (trigger.current ? watchPopup(trigger.current, shut.current) : undefined),
    [],
  );
  // After every draw, as the words or the control's name may have changed: the label unless the
  // name says it already (an icon button whose aria-label is the label, or holds it: "More
  // actions for PR 412"), then the key in words, then why the control is off.
  useLayoutEffect(() => {
    const control = trigger.current;
    if (!control || !holder.current) return;
    describe(
      control,
      holder.current,
      sentences([
        plain(nameOf(control)).includes(plain(label)) ? '' : label,
        keys ? spokenKeys(keys) : '',
        reason ?? '',
      ]),
    );
  });
  return (
    <>
      <TooltipPrimitive.Root
        actionsRef={actions}
        onOpenChange={(open, details) => {
          const held =
            details.reason === 'trigger-hover'
              ? shut.current.hover || performance.now() - scrolledAt < SCROLL_QUIET
              : details.reason === 'trigger-focus' && shut.current.focus;
          if (open && held) {
            details.cancel();
            return;
          }
          if (open) shown.add(close);
          else shown.delete(close);
        }}
        disableHoverablePopup
      >
        {reason ? (
          <TooltipPrimitive.Trigger
            ref={trigger}
            render={
              <span
                data-slot="tooltip-reason"
                // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- for the keyboard
                tabIndex={0}
                className="inline-flex rounded-md"
              />
            }
          >
            {children}
          </TooltipPrimitive.Trigger>
        ) : (
          <TooltipPrimitive.Trigger ref={trigger} render={children} />
        )}
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner
            side={side}
            sideOffset={6}
            collisionPadding={6}
            className="pointer-events-none z-50 max-w-(--available-width)"
          >
            {/* A small menu: the menus' card, hairline and shadow, which every theme keeps apart
                from the page (its raised grey is a pressed fill in a light one, and some themes
                draw their strong hairline in it). The key's badge is the search field's, on the
                same card, its letters a step brighter. */}
            <TooltipPrimitive.Popup
              data-slot="tooltip"
              className="flex max-w-72 flex-col gap-0.5 rounded-md border border-border bg-popover px-2 py-1 text-label text-strong shadow-menu"
            >
              <span className="flex items-center gap-2">
                {label}
                {keys && (
                  <Kbd data-slot="tooltip-keys" className="text-t65">
                    {keys}
                  </Kbd>
                )}
              </span>
              {reason && <span className="text-t65">{reason}</span>}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
      {/* Out of the control's row, so it changes neither its look nor its words. */}
      {createPortal(
        <span ref={holder} id={id} hidden data-slot="tooltip-description" />,
        document.body,
      )}
    </>
  );
}
