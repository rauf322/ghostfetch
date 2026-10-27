import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/class-names/index.ts';

// List rows: a rule, or a request in Traffic. The selected row gets a white rule down its left
// edge, a rule that's off fades, and a request a rule changed sits on the code background.
const itemVariants = cva(
  'group/item relative grid cursor-pointer items-center border-b bg-background hover:bg-hover data-selected:bg-pressed data-selected:shadow-[inset_2px_0_0_var(--text)]',
  {
    variants: {
      variant: {
        rule: 'grid-cols-[22px_minmax(0,1fr)_auto_auto] gap-2.5 border-border px-3.5 py-[11px]',
        request:
          'grid-cols-[46px_minmax(0,1fr)_auto_52px] gap-2 border-line-soft px-3.5 py-[7px] data-hit:bg-code data-hit:data-selected:bg-pressed',
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
  hit,
  render,
  ...props
}: useRender.ComponentProps<'li'> &
  VariantProps<typeof itemVariants> & {
    selected?: boolean;
    off?: boolean;
    hit?: boolean;
  }) {
  return useRender({
    defaultTagName: 'li',
    props: mergeProps<'li'>(
      {
        className: cn(itemVariants({ variant }), className),
        'data-selected': selected || undefined,
        'data-off': off || undefined,
        'data-hit': hit || undefined,
      } as ComponentProps<'li'>,
      props,
    ),
    render,
    state: { slot: 'item', variant },
  });
}

export function ItemNumber({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="item-number"
      className={cn('self-start pt-0.5 text-control text-t30 tabular-nums', className)}
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
        'mt-[3px] flex min-w-0 items-baseline gap-2 overflow-hidden text-meta whitespace-nowrap text-t50 group-data-off/item:opacity-60',
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
