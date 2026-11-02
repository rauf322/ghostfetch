// The kit sheet's building blocks: a titled cell for each component, a labelled row of its
// states, and the words that say what a live one last did. HOVER and FOCUS are the classes those
// states add, given to a still copy so that a screenshot shows them.
import type { ReactNode } from 'react';
import { cn } from '../../../shared/ui/cn.ts';
import { FieldLabel } from '../../../shared/ui/kit/label.tsx';

export const HOVER = 'bg-pressed text-white';
export const FOCUS = 'outline outline-1 outline-offset-2 outline-foreground';

export function Cell({
  title,
  note,
  wide,
  children,
}: {
  title: string;
  note?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn('flex flex-col gap-[9px] bg-background pb-5', wide && 'col-span-2')}
    >
      <div className="mb-[3px] flex h-11 items-center border-b border-border px-3.5 text-control font-medium text-t80">
        {title}
        {note && <small className="ml-2 text-meta font-normal text-t40">{note}</small>}
      </div>
      <div className="mx-3.5 flex flex-col gap-4 pt-1">{children}</div>
    </section>
  );
}

export function Row({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div className={className ?? 'flex flex-wrap items-center gap-2'}>{children}</div>
    </div>
  );
}

// What a live component last did, for the eye and for the test.
export function Output({ testid, children }: { testid: string; children: ReactNode }) {
  return (
    <output data-testid={testid} className="text-meta text-t50">
      {children}
    </output>
  );
}
