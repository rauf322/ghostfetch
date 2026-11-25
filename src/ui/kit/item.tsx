import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../cn.ts';
import { CARD } from './card.tsx';

// List rows: a rule, or a request in Traffic. Rounded and inset from the list's edges, filled
// under the pointer and while a menu of its own is open (its ⋯'s, or its right-click menu, which
// marks it data-context-open); the selected row is a filled pill, and a rule that's off fades. A
// row that takes focus (a rule's, in the editor's list) has a ring inside its edge, which the rows
// around it don't cover. A rule's row starts with its switch (the green dot), then its name, with
// its slot at the right end (ItemSlot: what it did on the page, or its actions), over what it
// matches; a request's starts with its method, and its status and duration sit at its right end.
export const ROW_FOCUS =
  'focus-visible:outline-none focus-visible:ring-[1.5px] focus-visible:ring-t65 focus-visible:ring-inset';
const itemVariants = cva(
  `group/item relative mx-1.5 grid cursor-pointer items-center rounded-md hover:bg-hover has-[[aria-haspopup=menu][data-popup-open]]:bg-hover data-context-open:bg-hover data-selected:bg-pressed ${ROW_FOCUS}`,
  {
    variants: {
      variant: {
        rule: 'grid-cols-[auto_minmax(0,1fr)] gap-x-1 px-3 py-2.5',
        request: 'grid-cols-[auto_minmax(0,1fr)_auto] gap-3 px-2.5 py-2',
      },
    },
    defaultVariants: { variant: 'rule' },
  },
);

export function Item({
  className,
  variant = 'rule',
  selected,
  off,
  render,
  ...props
}: useRender.ComponentProps<'li'> &
  VariantProps<typeof itemVariants> & {
    selected?: boolean;
    off?: boolean;
  }) {
  return useRender({
    defaultTagName: 'li',
    props: mergeProps<'li'>(
      {
        className: cn(itemVariants({ variant }), className),
        'data-selected': selected || undefined,
        'data-off': off || undefined,
      } as ComponentProps<'li'>,
      props,
    ),
    render,
    state: { slot: 'item', variant },
  });
}

// Rows in a card (Traffic's groups, the popup's rules, New rule's recent requests): 4 px around
// them, so give each row mx-0, flush with the card.
export function ItemList({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="item-list"
      className={cn(CARD, 'm-0 list-none p-1', className)}
      {...props}
    />
  );
}

export function ItemContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="item-content" className={cn('min-w-0', className)} {...props} />;
}

// `quiet`: the row steps back (after T3 Code's receding rows), its name at normal weight in a
// quieter grey: a rule that's on but hasn't answered on the page, so the ones that did stand out.
export function ItemTitle({
  className,
  quiet,
  ...props
}: ComponentProps<'div'> & { quiet?: boolean }) {
  return (
    <div
      data-slot="item-title"
      data-quiet={quiet || undefined}
      className={cn(
        'truncate text-title font-medium text-strong group-data-off/item:text-t50',
        quiet && 'font-normal text-t65',
        className,
      )}
      {...props}
    />
  );
}

// Under the pointer, with keyboard focus on the row or anywhere in it, or while a menu one of its
// actions opened is open: a slot's actions show, and what it says doesn't, unless nothing can
// hover (touch:), where there are no actions. Base UI marks an open menu's trigger
// data-popup-open, and a tooltip's trigger too, so the menu's is the one with aria-haspopup.
const ACTIONS_SHOWN =
  'group-hover/item:pointer-events-auto group-hover/item:opacity-100 group-focus-visible/item:pointer-events-auto group-focus-visible/item:opacity-100 group-has-[:focus-visible]/item:pointer-events-auto group-has-[:focus-visible]/item:opacity-100 group-has-[[aria-haspopup=menu][data-popup-open]]/item:pointer-events-auto group-has-[[aria-haspopup=menu][data-popup-open]]/item:opacity-100';
const STATUS_HIDDEN =
  'group-hover/item:opacity-0 group-focus-visible/item:opacity-0 group-has-[:focus-visible]/item:opacity-0 group-has-[[aria-haspopup=menu][data-popup-open]]/item:opacity-0 touch:opacity-100';

// A row's one slot, at the end of its first line (after T3 Code's thread rows): what the row says
// at rest (children: "2 mocked", "· 4m"), and in the same place its actions (ItemAction), as
// above. As wide as what it says and at least as the actions (two, min-w-12; a className can say
// otherwise), so nothing in the row moves as they show. Where the row is short of room (a long
// name, a wider font, larger text) it gives way, down to that: what it says goes from its end
// first, its later parts wrapping onto a line out of sight, then its first part truncates. Where
// nothing can hover (touch:) there are no actions and no room kept for them: the row's own
// controls do what they do. The row's tooltip, its title (the name in full), doesn't show over
// the actions, which have their own. `statusId`: what it says, for a row to be described by.
export function ItemSlot({
  actions,
  statusId,
  className,
  children,
}: {
  actions?: ReactNode;
  statusId?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      data-slot="item-slot"
      className={cn(
        'relative ml-auto flex flex-[0_1_auto] items-center justify-end self-stretch',
        actions && 'min-w-12 touch:min-w-0',
        className,
      )}
    >
      <span
        id={statusId}
        data-slot="item-status"
        className={cn(
          'flex h-[1.5em] min-w-0 flex-wrap content-start items-center justify-end gap-x-1 overflow-hidden text-label whitespace-nowrap tabular-nums transition-opacity duration-100 [&>*:first-child]:min-w-0 [&>*:first-child]:truncate',
          actions && STATUS_HIDDEN,
        )}
      >
        {children}
      </span>
      {actions && (
        <span
          data-slot="item-slot-actions"
          title=""
          className={cn(
            'pointer-events-none absolute inset-y-0 right-0 -mr-[5px] flex items-center gap-0.5 opacity-0 transition-opacity duration-100 touch:hidden',
            ACTIONS_SHOWN,
          )}
        >
          {actions}
        </span>
      )}
    </span>
  );
}

// One of a slot's actions: a 24 px square with an icon, as T3 Code's. Give it an aria-label and a
// Tooltip; a menu's trigger renders as one. A press on it doesn't start dragging the row (a rule's
// row is draggable) and leaves focus where it was.
export function ItemAction({
  className,
  onMouseDown,
  ...props
}: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      data-slot="item-action"
      onMouseDown={(event) => {
        event.preventDefault();
        onMouseDown?.(event);
      }}
      className={cn(
        'grid size-6 flex-none place-items-center rounded-sm text-t50 hover:bg-raised hover:text-strong data-popup-open:bg-raised data-popup-open:text-strong',
        className,
      )}
      {...props}
    />
  );
}

export function ItemDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-description"
      className={cn(
        'mt-0.5 flex min-w-0 items-baseline gap-2 overflow-hidden text-meta whitespace-nowrap text-t50 group-data-off/item:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

export function ItemActions({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-actions"
      className={cn('flex items-center gap-2', className)}
      {...props}
    />
  );
}
