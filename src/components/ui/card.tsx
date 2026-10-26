import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/utils.ts';

// The rule editor's sections: full-width bands separated by hairlines, each with a title bar
// numbered like the site's chapters, "02 — Match requests".
export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      data-slot="card"
      className={cn(
        'flex flex-col gap-[9px] border-b border-border pb-3.5 *:not-data-[slot=card-title]:mx-3.5 [&>:first-child:not([data-slot=card-title])]:mt-3.5',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, index, note, children, ...props }: ComponentProps<'div'> & { index?: number; note?: ReactNode }) {
  return (
    <div
      data-slot="card-title"
      className={cn('mb-[3px] flex h-[34px] items-center border-b border-border bg-card px-3.5 text-control text-t80 uppercase tracking-wide', className)}
      {...props}
    >
      {index != null && <span className="whitespace-pre">{String(index).padStart(2, '0')} — </span>}
      {children}
      {note && <small className="ml-2 text-meta tracking-mono text-t40 normal-case">{note}</small>}
    </div>
  );
}

// Grey guidance under a field; "bad" turns it white, with a cross, when what's in the field is wrong.
export function CardHint({ className, tone = 'default', ...props }: ComponentProps<'p'> & { tone?: 'default' | 'bad' }) {
  return (
    <p
      data-slot="card-hint"
      data-tone={tone}
      className={cn("m-0 text-meta leading-[1.55] text-t40 data-[tone=bad]:text-foreground data-[tone=bad]:before:content-['✗_']", className)}
      {...props}
    />
  );
}
