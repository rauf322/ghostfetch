import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva } from 'class-variance-authority';
import { cn } from '../cn.ts';

// What a rule did to a request, in words. "fired" is green with the green dot in front: a rule
// fired. "error" is inverted white.
const badgeVariants = cva('inline-flex flex-none items-center text-label font-medium', {
  variants: {
    variant: {
      fired:
        "text-signal before:mr-1.5 before:size-1.5 before:rounded-full before:bg-signal before:content-['']",
      error: 'rounded-sm bg-foreground px-1.5 font-semibold text-black',
    },
  },
});

export function Badge({
  className,
  variant,
  render,
  ...props
}: useRender.ComponentProps<'span'> & { variant: 'fired' | 'error' }) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      { className: cn(badgeVariants({ variant }), className) },
      props,
    ),
    render,
    state: { slot: 'badge', variant },
  });
}

// Status codes, in the monospace font: plain when fine, outlined for 4xx, inverted for 5xx and for
// a request that failed without one.
const statusVariants = cva('flex-none font-mono text-meta tabular-nums', {
  variants: {
    tone: {
      '2xx': 'text-t65',
      '3xx': 'text-t40',
      '4xx': 'rounded-sm px-1 text-foreground shadow-[inset_0_0_0_1px_var(--t50)]',
      '5xx': 'rounded-sm bg-foreground px-1 font-semibold text-black',
      none: 'text-t30',
    },
  },
});

function statusTone(status: number | null | undefined, failed: boolean) {
  if (!status) return failed ? '5xx' : 'none';
  if (status >= 500) return '5xx';
  if (status >= 400) return '4xx';
  if (status >= 300) return '3xx';
  return '2xx';
}

export function StatusCode({
  status,
  failed = false,
  className,
}: {
  status: number | null | undefined;
  failed?: boolean;
  className?: string;
}) {
  return (
    <span
      data-slot="status"
      className={cn(statusVariants({ tone: statusTone(status, failed) }), className)}
    >
      {status || (failed ? 'ERR' : '—')}
    </span>
  );
}
