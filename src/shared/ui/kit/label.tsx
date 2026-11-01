import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';

// Section labels in grey, like "When a request matches", and the smaller ones over fields.
export function Label({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="label"
      className={cn('text-label font-medium text-t40', className)}
      {...props}
    />
  );
}

export function FieldLabel({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="field-label"
      className={cn('text-label text-t40', className)}
      {...props}
    />
  );
}
