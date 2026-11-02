import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';
import { CARD } from './card.tsx';

// List rows: a rule, or a request in Traffic. Rounded and inset from the list's edges; the
// selected row is a filled pill, and a rule that's off fades. A rule's row starts with its dot, a
// request's with its method, and its status and duration sit at its right end.
const itemVariants = cva(
  'group/item relative mx-1.5 grid cursor-pointer items-center rounded-md hover:bg-hover data-selected:bg-pressed',
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

export function ItemTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-title"
      className={cn(
        'truncate text-title font-medium text-white group-data-off/item:text-t50',
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
