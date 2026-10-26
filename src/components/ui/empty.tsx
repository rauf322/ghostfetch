import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils.ts';

// The empty state: centred on the dotted grid, a title, one line of guidance and the next step.
export function Empty({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty"
      className={cn('m-auto max-w-[420px] px-5 py-8 text-center text-t50', className)}
      {...props}
    />
  );
}

export function EmptyMedia({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-media"
      className={cn('flex justify-center', className)}
      {...props}
    />
  );
}

export function EmptyTitle({ className, children, ...props }: ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="empty-title"
      className={cn('mt-4 mb-1.5 text-title font-medium text-foreground', className)}
      {...props}
    >
      {children}
    </h2>
  );
}

export function EmptyDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="empty-description"
      className={cn('mb-4 text-small', className)}
      {...props}
    />
  );
}
