// The editor's layout: the sidebar (app/sidepanel/sidebar.tsx), and beside it the open view, a
// rule or Traffic. From 760px wide the two sit side by side, and the sidebar is one you can resize
// and hide (sidebar.tsx); in a narrower side panel only one shows, the sidebar until something is
// picked in it, with a button to go back to it.
import { useEffect, useRef } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn.ts';
import { Icon } from './kit/icon.tsx';
import { Input } from './kit/input.tsx';
import { holdWidths, releaseWidths, useListColumn } from './sidebar.tsx';

// The sidebar and what's open beside it, in a row: a ListPane, a SidebarHandle, then the open
// view. A flexbox rather than a grid: when the sidebar's width changes, Firefox lays each item of
// a grid out again from scratch, a long body and all (60 ms a frame beside 15,000 lines), and a
// flex item only as far as its own width changed.
export function Split({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('relative flex h-full min-h-0', className)} {...props} />;
}

// While the sidebar's width slides (Cmd/Ctrl+B, or the arrow keys on its edge), what keeps its
// width while the edge is dragged keeps it too (holdWidths()), so a long body isn't laid out
// again on every frame of the slide. Returns what stops it.
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

// The sidebar's column. `screen`: in a narrow panel it's the whole screen (the Rules view, with
// nothing open in it); otherwise it gives way to what's open there. From 760px wide it's beside
// what's open, as wide as its edge was dragged (a SidebarHandle) or else its usual width: 272 px,
// a little more in a wide window. `collapsed`: hidden, its width sliding to nothing, and once it
// has, it's gone (invisible, so nothing in it takes focus). While its edge is dragged it follows
// the pointer instead of sliding.
export function ListPane({
  screen,
  collapsed = false,
  className,
  style,
  ...props
}: Omit<ComponentProps<'aside'>, 'ref'> & {
  screen: boolean;
  collapsed?: boolean;
}) {
  const column = useListColumn();
  const pane = useRef<HTMLElement>(null);
  useEffect(() => holdWhileSliding(pane.current!), []);
  return (
    <aside
      ref={pane}
      data-collapsed={collapsed || undefined}
      data-resizing={column.resizing || undefined}
      style={{ ...column.style, ...style }}
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col [--list-default:clamp(272px,21%,340px)] wide:w-[var(--list-width,var(--list-default))] wide:flex-none wide:overflow-hidden wide:border-r wide:border-border',
        // Hidden, the hairline lies over what's open rather than beside it, so that starts at the
        // window's edge.
        'wide:data-collapsed:invisible wide:data-collapsed:w-0 wide:data-collapsed:-mr-px',
        'motion-safe:transition-[width,visibility] motion-safe:duration-200 motion-safe:ease-out data-resizing:transition-none',
        !screen && 'max-wide:hidden',
        className,
      )}
      {...props}
    />
  );
}

// What's open beside the sidebar: a rule, or New rule.
export function DetailPane({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col', className)}
      {...props}
    />
  );
}

// The bar under the sidebar: a hairline, then a row of quiet buttons.
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

// What a list says when it has nothing to show.
export function ListEmpty({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('px-4 py-[18px] text-t50 [&_p]:mb-3', className)} {...props} />
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

// A filled, rounded search field, with the magnifier inside it, and at its right end `hint`, the
// key that puts the cursor in it ("/"), in a small box. The field covers both, so a click anywhere
// in it goes to the field.
export function SearchField({
  hint,
  className,
  ...props
}: ComponentProps<typeof Input> & { hint?: ReactNode }) {
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
          hint && 'pr-8',
          className,
        )}
        {...props}
      />
      {hint && (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-border px-1 font-mono text-micro text-t40"
        >
          {hint}
        </kbd>
      )}
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
