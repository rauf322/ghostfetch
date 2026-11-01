// A check's result, like "Matches" or "Valid JSON": the green dot when it passed, a cross when
// it didn't, and neither for a plain note.
import type { ComponentProps } from 'react';
import { cn } from '../../../../shared/ui/cn.ts';

export function Verdict({
  tone,
  className,
  ...props
}: ComponentProps<'span'> & { tone?: 'good' | 'bad' }) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center gap-[7px] text-meta',
        "data-[tone=good]:text-control data-[tone=good]:text-t80 data-[tone=good]:before:size-2 data-[tone=good]:before:flex-none data-[tone=good]:before:rounded-full data-[tone=good]:before:bg-signal data-[tone=good]:before:content-['']",
        "data-[tone=bad]:before:content-['✗']",
        className,
      )}
      {...props}
    />
  );
}
