// The kit sheet's building blocks: a numbered cell for each component, a labelled row of its
// states, and the words that say what a live one last did. HOVER and FOCUS are the classes those
// states add, given to a still copy so that a screenshot shows them.
import type { ReactNode } from 'react';
import { cn } from '../../../shared/lib/class-names/index.ts';
import { Card, CardTitle } from '../../../shared/ui/kit/card.tsx';
import { FieldLabel } from '../../../shared/ui/kit/label.tsx';

export const HOVER = 'bg-pressed text-white';
export const FOCUS = 'outline outline-1 outline-offset-2 outline-foreground';

export function Cell({
  index,
  title,
  note,
  wide,
  children,
}: {
  index: number;
  title: string;
  note?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className={cn('border-b-0 bg-background pb-5', wide && 'col-span-2')}>
      <CardTitle index={index} note={note}>
        {title}
      </CardTitle>
      <div className="flex flex-col gap-4 pt-1">{children}</div>
    </Card>
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
