import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';

// The card: a step lighter than the canvas, with soft corners, as Revolut's and T3 Code's
// settings. A rule's settings, Traffic's groups of requests and a request's facts sit in one;
// what's inside brings its own padding (a list of rows wants 4 px, words want 14).
export const CARD = 'rounded-lg bg-card';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card" className={cn(CARD, className)} {...props} />;
}

// Grey guidance under a field; "bad" turns it white, with a cross, when what's in the field is wrong.
export function CardHint({
  className,
  tone = 'default',
  ...props
}: ComponentProps<'p'> & { tone?: 'default' | 'bad' }) {
  return (
    <p
      data-slot="card-hint"
      data-tone={tone}
      className={cn(
        "m-0 text-meta leading-[1.55] text-t40 data-[tone=bad]:text-foreground data-[tone=bad]:before:content-['✗_']",
        className,
      )}
      {...props}
    />
  );
}
