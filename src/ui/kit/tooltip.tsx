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
// own shows none while that's open, nor as the menu gives focus back to it (watchPopups()). It
// never takes the pointer, so what's under it can still be clicked, and it stays inside the
// window, flipping to the other side where this one has no room (the popup is 330 px wide).
//
// A screen reader hears its words as the control's description, as it heard a title, with the key
// in words (useDescription()); not where they're the control's name already. A description isn't
// a name: a control that's only an icon still needs its own aria-label.
//
// <Tooltip> is a control's own. Many controls of one kind (each row's Turn off in a long list)
// share one instead: one root and one popup (<SharedTooltip>, with a handle from
// createTooltipHandle()), each control a <TooltipTrigger> that passes it its words, so a list of
// rows mounts no tooltip of its own per row.
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactElement, ReactNode, RefObject } from 'react';
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

// Around each page (the popup, the editor, the kit page), for its tooltips to share the wait, to
// watch it scroll (any scroll, of the page or of a list in it, as a scroll event doesn't bubble
// but passes the window on its way to what scrolled), and to watch its controls' own popups.
export function TooltipProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    const stopWatching = watchPopups(document);
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      stopWatching();
    };
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

// What a tooltip says: its label, the key that does the same, and why its control is off.
interface Tip {
  label: string;
  keys?: string;
  reason?: string;
}

// The hidden copies of tooltips' words that a screen reader is pointed at (aria-describedby): one
// for each set of words, however many controls have them, so a list's rows share one per kind of
// action. Always in the page, so a control is described while its tooltip is shut; out of every
// control's row, so they change neither its look nor its words; gone with the last control.
const copies = new Map<string, { id: string; users: number }>();
let copiesMade = 0;

function holdCopy(words: string) {
  let copy = copies.get(words);
  if (!copy) {
    const element = document.createElement('span');
    copiesMade += 1;
    element.id = `tooltip-words-${copiesMade}`;
    element.hidden = true;
    element.dataset.slot = 'tooltip-description';
    element.textContent = words;
    document.body.append(element);
    copy = { id: element.id, users: 0 };
    copies.set(words, copy);
  }
  copy.users += 1;
  return copy.id;
}

function dropCopy(words: string) {
  const copy = copies.get(words);
  if (!copy) return;
  copy.users -= 1;
  if (copy.users > 0) return;
  copies.delete(words);
  document.getElementById(copy.id)?.remove();
}

// Points the control's aria-describedby at the copy `id` instead of `before`, after the ids the
// control has of its own ('' for none).
function point(control: HTMLElement, before: string, id: string) {
  const was = control.getAttribute('aria-describedby') ?? '';
  const ids = was.split(/\s+/).filter((each) => each && each !== before && each !== id);
  if (id) ids.push(id);
  const now = ids.join(' ');
  if (now === was) return;
  if (now) control.setAttribute('aria-describedby', now);
  else control.removeAttribute('aria-describedby');
}

// After every draw, as the words or the control's name may have changed: its description is the
// tooltip's label unless the name says it already (an icon button whose aria-label is the label,
// or holds it: "More actions for PR 412"), then the key in words, then why the control is off.
// Done after React has drawn the control, as its name is only known then, and on whatever element
// the control is.
function useDescription(
  trigger: RefObject<HTMLElement | null>,
  { label, keys, reason }: Tip,
) {
  // The words of the copy the control points at now ('' for none).
  const held = useRef('');
  useLayoutEffect(() => {
    const control = trigger.current;
    if (!control) return;
    const words = sentences([
      plain(nameOf(control)).includes(plain(label)) ? '' : label,
      keys ? spokenKeys(keys) : '',
      reason ?? '',
    ]);
    const before = held.current ? (copies.get(held.current)?.id ?? '') : '';
    if (words !== held.current) {
      if (held.current) dropCopy(held.current);
      held.current = words;
      point(control, before, words ? holdCopy(words) : '');
    }
    // The same copy again, should the control's own ids have been drawn over it.
    else point(control, before, before);
  });
  useLayoutEffect(
    () => () => {
      if (held.current) dropCopy(held.current);
      held.current = '';
    },
    [],
  );
}

// Which ways a control's own popup holds its tooltip shut: the pointer's and the keyboard's. Only
// the controls held shut now.
interface Shut {
  hover: boolean;
  focus: boolean;
}
const shuts = new Map<Element, Shut>();

const isOpen = (control: Element) => control.getAttribute('aria-expanded') === 'true';

function release(control: Element, way: keyof Shut) {
  const shut = shuts.get(control);
  if (!shut) return;
  shut[way] = false;
  if (!shut.hover && !shut.focus) shuts.delete(control);
}

// Controls gone from the page let go of, and with them what's around them (an editor's ⋯, which
// its own Delete takes away as it shuts the menu, the whole closed editor): one taken away while
// its popup was open keeps aria-expanded "true", so it's never released, and nothing else holds it.
function forgetGone() {
  for (const control of shuts.keys()) if (!control.isConnected) shuts.delete(control);
}

// A control that opens a popup of its own (aria-haspopup: a ⋯ menu, a select) shows no tooltip
// while that's open, nor once it's shut, when Base UI gives focus back to the control (after Esc,
// or a click outside): the pointer has to leave the control and come back, or focus leave it and
// come back (Tab), for the tooltip to show again. One watcher for every control in the page, not
// one each. Returns what stops watching.
function watchPopups(page: Document) {
  const watch = new MutationObserver((records) => {
    for (const { target, oldValue } of records) {
      if (!(target instanceof Element)) continue;
      const popup = target.getAttribute('aria-haspopup');
      if (!popup || popup === 'false') continue;
      const was = oldValue === 'true';
      const now = isOpen(target);
      if (now && !was) shuts.set(target, { hover: true, focus: true });
      // Shut with the pointer elsewhere, which then has left already.
      else if (!now && was && !target.matches(':hover')) release(target, 'hover');
    }
  });
  watch.observe(page, {
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-expanded'],
    attributeOldValue: true,
  });
  // The pointer over something that isn't the control.
  function moved(event: Event) {
    forgetGone();
    for (const control of shuts.keys())
      if (!isOpen(control) && !control.contains(event.target as Node))
        release(control, 'hover');
  }
  // Focus gone from the control, or landed elsewhere once the popup is shut, as on a control
  // clicked outside it, which keeps it rather than giving it back.
  function landed(event: FocusEvent) {
    forgetGone();
    for (const control of shuts.keys())
      if (!isOpen(control) && event.target !== control) release(control, 'focus');
  }
  function left(event: FocusEvent) {
    const control = event.target as Element;
    if (shuts.has(control) && !isOpen(control)) release(control, 'focus');
  }
  page.addEventListener('pointerover', moved, true);
  page.addEventListener('focusin', landed, true);
  page.addEventListener('focusout', left, true);
  return () => {
    watch.disconnect();
    page.removeEventListener('pointerover', moved, true);
    page.removeEventListener('focusin', landed, true);
    page.removeEventListener('focusout', left, true);
  };
}

// A tooltip's root: what a scroll does to it while it's open, and when it stays shut: while the
// page scrolls under a pointer that's still, and while its control's own popup holds it.
function useTipRoot() {
  const actions = useRef<TooltipPrimitive.Root.Actions>(null);
  // The control it's open for.
  const at = useRef<Element | undefined>(undefined);
  const close = useCallback(() => {
    if (!at.current?.matches(':focus-visible')) actions.current?.close();
  }, []);
  useEffect(
    () => () => {
      shown.delete(close);
    },
    [close],
  );
  const onOpenChange = useCallback(
    (open: boolean, details: TooltipPrimitive.Root.ChangeEventDetails) => {
      const shut = details.trigger ? shuts.get(details.trigger) : undefined;
      const held =
        details.reason === 'trigger-hover'
          ? Boolean(shut?.hover) || performance.now() - scrolledAt < SCROLL_QUIET
          : details.reason === 'trigger-focus' && Boolean(shut?.focus);
      if (open && held) {
        details.cancel();
        return;
      }
      if (open) {
        at.current = details.trigger;
        shown.add(close);
      } else shown.delete(close);
    },
    [close],
  );
  return { actions, onOpenChange };
}

// The popup: a small menu, the menus' card, hairline and shadow, which every theme keeps apart
// from the page (its raised grey is a pressed fill in a light one, and some themes draw their
// strong hairline in it). The key's badge is the search field's, on the same card, its letters a
// step brighter.
function TipPopup({ side, tip }: { side: Side; tip: Tip | undefined }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        sideOffset={6}
        collisionPadding={6}
        className="pointer-events-none z-50 max-w-(--available-width)"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip"
          className="flex max-w-72 flex-col gap-0.5 rounded-md border border-border bg-popover px-2 py-1 text-label text-strong shadow-menu"
        >
          <span className="flex items-center gap-2">
            {tip?.label}
            {tip?.keys && (
              <Kbd data-slot="tooltip-keys" className="text-t65">
                {tip.keys}
              </Kbd>
            )}
          </span>
          {tip?.reason && <span className="text-t65">{tip.reason}</span>}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

type Side = 'top' | 'bottom' | 'left' | 'right';

export function Tooltip({
  label,
  keys,
  reason,
  side = 'top',
  children,
}: Tip & {
  // `keys`: the key that does the same, as this platform writes it (modKey() in kbd.tsx for ⌘B).
  // `reason`: why the control is off. A control that's off takes neither the pointer nor focus,
  // so the tooltip hangs on a wrapper around it instead, which focus can reach, and says why under
  // the label.
  side?: Side;
  // The control, which becomes the tooltip's trigger: one element that takes props and a ref,
  // as the kit's controls do.
  children: ReactElement;
}) {
  // The control (typed as Base UI types its trigger, though it may be a field or a span).
  const trigger = useRef<HTMLButtonElement>(null);
  const { actions, onOpenChange } = useTipRoot();
  useDescription(trigger, { label, keys, reason });
  return (
    <TooltipPrimitive.Root
      actionsRef={actions}
      onOpenChange={onOpenChange}
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
      <TipPopup side={side} tip={{ label, keys, reason }} />
    </TooltipPrimitive.Root>
  );
}

// One tooltip for many controls: what links a <SharedTooltip> with its <TooltipTrigger>s.
export type TooltipHandle = TooltipPrimitive.Handle<Tip>;
export const createTooltipHandle = (): TooltipHandle =>
  TooltipPrimitive.createHandle<Tip>();

// The root and the popup of a tooltip many controls share, saying what the one it's open for
// passes it; drawn once, anywhere on the page.
export function SharedTooltip({
  handle,
  side = 'top',
}: {
  handle: TooltipHandle;
  side?: Side;
}) {
  const { actions, onOpenChange } = useTipRoot();
  return (
    <TooltipPrimitive.Root
      handle={handle}
      actionsRef={actions}
      onOpenChange={onOpenChange}
      disableHoverablePopup
    >
      {({ payload }) => <TipPopup side={side} tip={payload} />}
    </TooltipPrimitive.Root>
  );
}

// A control that opens a shared tooltip, with its own words, and described by them as a control
// with a <Tooltip> is.
export function TooltipTrigger({
  handle,
  label,
  keys,
  children,
}: {
  handle: TooltipHandle;
  label: string;
  keys?: string;
  children: ReactElement;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const tip = useMemo(() => ({ label, keys }), [label, keys]);
  useDescription(trigger, tip);
  return (
    <TooltipPrimitive.Trigger
      handle={handle}
      payload={tip}
      ref={trigger}
      render={children}
    />
  );
}
