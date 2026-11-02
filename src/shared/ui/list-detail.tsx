// The editor's layout, shared by the Rules and Traffic tabs: a list, and what's picked in it. From
// 760px wide the two sit side by side, and the list is a sidebar you can resize and hide
// (sidebar.tsx); in a narrower side panel only one shows, the list until something is picked, with
// a button to go back to it.
import { useEffect, useRef } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn.ts';
import { Icon } from './kit/icon.tsx';
import { Input } from './kit/input.tsx';
import { holdWidths, releaseWidths, useListColumn } from './sidebar.tsx';
import type { SidebarView } from './sidebar.tsx';

// The list and what's open beside it, in a row: a ListPane, a SidebarHandle, then a DetailPane (or
// Traffic's drawer). A flexbox rather than a grid: when the list's width changes, Firefox lays each
// item of a grid out again from scratch, a long body and all (60 ms a frame beside 15,000 lines),
// and a flex item only as far as its own width changed.
export function Split({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('relative flex h-full min-h-0', className)} {...props} />;
}

// While the list's width slides (Cmd/Ctrl+B, or the arrow keys on its edge), what keeps its width
// while the edge is dragged keeps it too (holdWidths()), so a long body isn't laid out again on
// every frame of the slide. Returns what stops it.
function holdWhileSliding(pane: HTMLElement) {
  let held: HTMLElement[] = [];
  const isWidth = (event: TransitionEvent) =>
    event.target === pane && event.propertyName === 'width';
  const start = (event: TransitionEvent) => {
    if (!isWidth(event)) return;
    releaseWidths(held);
    held = holdWidths(pane.parentElement!);
  };
  const end = (event: TransitionEvent) => {
    if (!isWidth(event)) return;
    releaseWidths(held);
    held = [];
  };
  pane.addEventListener('transitionrun', start);
  pane.addEventListener('transitionend', end);
  pane.addEventListener('transitioncancel', end);
  return () => {
    pane.removeEventListener('transitionrun', start);
    pane.removeEventListener('transitionend', end);
    pane.removeEventListener('transitioncancel', end);
    releaseWidths(held);
  };
}

// `view`'s list. `picked`: something in it is open, which hides the list in a narrow panel. From
// 760px wide, while something is open beside it (`beside`: always in Rules, a request in
// Traffic), it's a sidebar, as wide as its edge was dragged (a SidebarHandle) or else its usual
// share of the window: a third, at least 300 px, in Rules; in Traffic, what the request's drawer
// leaves, which is 44% at most 600 px. Otherwise it takes the whole width. `collapsed`: the
// sidebar is hidden, its width sliding to nothing, and once it has, it's gone (invisible, so nothing
// in it takes focus). While its edge is dragged it follows the pointer instead of sliding.
// `divider`: a hairline along its right edge (Traffic's drawer floats as a card, so has none).
export function ListPane({
  view,
  picked,
  beside = true,
  collapsed = false,
  divider = true,
  className,
  style,
  ...props
}: Omit<ComponentProps<'aside'>, 'ref'> & {
  view: SidebarView;
  picked: boolean;
  beside?: boolean;
  collapsed?: boolean;
  divider?: boolean;
}) {
  const column = useListColumn(view);
  const pane = useRef<HTMLElement>(null);
  useEffect(() => holdWhileSliding(pane.current!), []);
  return (
    <aside
      ref={pane}
      data-view={view}
      data-beside={beside || undefined}
      data-collapsed={collapsed || undefined}
      data-resizing={column.resizing || undefined}
      style={{ ...column.style, ...style }}
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col wide:overflow-hidden',
        'data-[view=rules]:[--list-default:max(300px,34%)] data-[view=traffic]:[--list-default:max(56%,100%_-_600px)]',
        // The collapsed width names one attribute more, so it outranks the open one.
        'wide:data-beside:w-[var(--list-width,var(--list-default))] wide:data-beside:flex-none wide:data-beside:data-collapsed:invisible wide:data-beside:data-collapsed:w-0',
        // Hidden, the hairline lies over what's open rather than beside it, so that starts at the
        // window's edge.
        divider &&
          'wide:border-r wide:border-border wide:data-beside:data-collapsed:-mr-px',
        'motion-safe:transition-[width,visibility] motion-safe:duration-200 motion-safe:ease-out data-resizing:transition-none',
        picked && 'max-wide:hidden',
        className,
      )}
      {...props}
    />
  );
}

// What's picked in the list, in the rest of the row. With nothing picked it shows an empty state.
export function DetailPane({
  picked,
  className,
  ...props
}: ComponentProps<'section'> & { picked: boolean }) {
  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col',
        !picked && 'max-wide:hidden',
        className,
      )}
      {...props}
    />
  );
}

// The row over a list: its search field and the button that adds to it.
export function PaneToolbar({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex min-h-12 flex-none items-center gap-2 px-2.5', className)}
      {...props}
    />
  );
}

// A list's name and its count, as small grey labels over its rows.
export function SectionRow({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex h-7 flex-none items-center justify-between gap-3 px-4',
        className,
      )}
      {...props}
    />
  );
}

// The bar under a list: a hairline, then a row of quiet buttons.
export function PaneFooter({ className, ...props }: ComponentProps<'footer'>) {
  return (
    <footer
      className={cn(
        'flex h-11 flex-none items-center gap-0.5 border-t border-border px-1.5',
        className,
      )}
      {...props}
    />
  );
}

// Its rows are rounded and inset from the edges (Item).
export function List({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <ul
      className={cn('min-h-0 flex-1 overflow-auto py-1 scroll-thin', className)}
      {...props}
    />
  );
}

// What a list says when it has nothing to show.
export function ListEmpty({ className, ...props }: ComponentProps<'li'>) {
  return (
    <li className={cn('px-4 py-[18px] text-t50 [&_p]:mb-3', className)} {...props} />
  );
}

// The bar across the top of what's open: a rule's name, or a request's method, path and status.
export function PaneHead({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex h-11 flex-none items-stretch border-b border-border',
        className,
      )}
      {...props}
    />
  );
}

// What scrolls under the pane's head. A section can size itself to it (the rule editor's body
// editor does) by finding it as data-slot="pane-scroll".
export function PaneScroll({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="pane-scroll"
      className={cn('flex min-h-0 flex-1 flex-col overflow-auto scroll-thin', className)}
      {...props}
    />
  );
}

// A labelled part of a pane: a small grey label, with room for a link or a note at its right end,
// over a card or a list ("When a request matches", "Just now", "Response body"). `level` is the
// heading's: 2 under a pane's title, 3 under a request's name in Traffic's drawer.
export function PaneSection({
  label,
  aside,
  level = 2,
  className,
  children,
}: {
  label: ReactNode;
  aside?: ReactNode;
  level?: 2 | 3;
  className?: string;
  children: ReactNode;
}) {
  const Heading = `h${level}` as const;
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <Heading className="flex items-baseline justify-between gap-3 px-1 text-label font-medium text-t40">
        <span className="min-w-0 truncate">{label}</span>
        {aside}
      </Heading>
      {children}
    </section>
  );
}

// A filled, rounded search field, with the magnifier inside it. The field covers the magnifier
// too, so a click anywhere in it goes to the field.
export function SearchField({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <div className="relative flex min-w-0 flex-1 items-center">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3 flex text-t40"
      >
        <Icon name="search" size={14} />
      </span>
      <Input
        variant="bare"
        type="search"
        className={cn(
          'h-8 flex-1 rounded-md bg-card pl-[34px] focus:shadow-[inset_0_0_0_1px_var(--line-strong)]',
          className,
        )}
        {...props}
      />
    </div>
  );
}

// An HTTP method, as in "GET /api/user": code, so in the monospace font, in a small rounded box.
// Green while a rule answered the request (`matched`).
export function Method({
  matched = false,
  className,
  ...props
}: ComponentProps<'span'> & { matched?: boolean }) {
  return (
    <span
      data-matched={matched || undefined}
      className={cn(
        'inline-flex h-7 min-w-11 flex-none items-center justify-center rounded-md bg-pressed px-1.5 font-mono text-[11px] font-medium text-t65 data-matched:bg-signal-soft data-matched:text-signal',
        className,
      )}
      {...props}
    />
  );
}
