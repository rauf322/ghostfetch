// The editor's layout, shared by the Rules and Traffic tabs: a list, and what's picked in it. From
// 760px wide the two sit side by side; in a narrower side panel only one shows, the list until
// something is picked, with a button to go back to it.
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';
import { Icon } from './kit/icon.tsx';
import { Input } from './kit/input.tsx';

export function Split({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'grid h-full min-h-0 grid-cols-[minmax(0,1fr)] wide:grid-cols-[minmax(300px,34%)_minmax(0,1fr)]',
        className,
      )}
      {...props}
    />
  );
}

// `picked`: something in the list is open, which hides the list in a narrow panel.
export function ListPane({
  picked,
  className,
  ...props
}: ComponentProps<'aside'> & { picked: boolean }) {
  return (
    <aside
      className={cn(
        'flex min-h-0 min-w-0 flex-col wide:border-r wide:border-border',
        picked && 'max-wide:hidden',
        className,
      )}
      {...props}
    />
  );
}

// With nothing picked it shows an empty state.
export function DetailPane({
  picked,
  className,
  ...props
}: ComponentProps<'section'> & { picked: boolean }) {
  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-col',
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
