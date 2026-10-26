import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils.ts';

// Small uppercase labels with wide tracking, like the site's CHAPTERS heading, and the smaller ones
// over fields.
export function Label({ className, ...props }: ComponentProps<'span'>) {
  return <span data-slot="label" className={cn('text-label text-t40 uppercase tracking-label', className)} {...props} />;
}

export function FieldLabel({ className, ...props }: ComponentProps<'span'>) {
  return <span data-slot="field-label" className={cn('text-micro text-t40 uppercase tracking-badge', className)} {...props} />;
}
