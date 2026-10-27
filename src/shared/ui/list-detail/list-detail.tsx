// The editor's layout, shared by the Rules and Traffic tabs: a list, and what's picked in it. From
// 760px wide the two sit side by side; in a narrower side panel only one shows, the list until
// something is picked, with a back button to return to it.
import type { ComponentProps } from 'react';
import { cn } from '../../lib/class-names/index.ts';
import { Button } from '../kit/button.tsx';
import { Icon } from '../kit/icon.tsx';
import { Input } from '../kit/input.tsx';

export function Split({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'grid h-full min-h-0 grid-cols-[minmax(0,1fr)] wide:grid-cols-[minmax(320px,38%)_minmax(0,1fr)]',
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

// With nothing picked it shows an empty state, on the dotted grid.
export function DetailPane({
  picked,
  className,
  ...props
}: ComponentProps<'section'> & { picked: boolean }) {
  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-col',
        !picked && 'bg-dots max-wide:hidden',
        className,
      )}
      {...props}
    />
  );
}

export function PaneToolbar({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex min-h-[42px] flex-none items-stretch border-b border-border',
        className,
      )}
      {...props}
    />
  );
}

// A list's name and its count, as small labels.
export function SectionRow({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex h-[34px] flex-none items-center justify-between gap-3 border-b border-border px-3.5',
        className,
      )}
      {...props}
    />
  );
}

// The bar under a list, like the lesson player on effect.institute: a row of cells.
export function PaneFooter({ className, ...props }: ComponentProps<'footer'>) {
  return (
    <footer
      className={cn(
        'flex h-[38px] flex-none items-stretch border-t border-border',
        className,
      )}
      {...props}
    />
  );
}

export function List({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <ul
      className={cn('min-h-0 flex-1 overflow-auto bg-dots scroll-thin', className)}
      {...props}
    />
  );
}

// What a list says when it has nothing to show.
export function ListEmpty({ className, ...props }: ComponentProps<'li'>) {
  return (
    <li
      className={cn('bg-background px-3.5 py-[18px] text-t50 [&_p]:mb-3', className)}
      {...props}
    />
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

export function PaneScroll({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex min-h-0 flex-1 flex-col overflow-auto scroll-thin', className)}
      {...props}
    />
  );
}

// Back to the list, in a narrow panel only.
export function BackButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('h-full w-11 border-r border-border wide:hidden', className)}
      {...props}
    >
      <Icon name="back" size={18} />
    </Button>
  );
}

// A search field filling a cell of a toolbar, with the magnifier inside it. The field covers the
// whole cell, magnifier included, so a click anywhere in it goes to the field.
export function SearchField({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <div className="relative flex min-w-0 flex-1 items-center">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 flex text-t30"
      >
        <Icon name="search" size={14} />
      </span>
      <Input
        variant="bare"
        type="search"
        className={cn('flex-1 pl-9', className)}
        {...props}
      />
    </div>
  );
}

// An HTTP method, as in "GET /api/user".
export function Method({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'flex-none text-control font-medium tracking-[0.04em] text-t80',
        className,
      )}
      {...props}
    />
  );
}
