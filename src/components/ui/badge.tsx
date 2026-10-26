import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.ts';

// Rule types and rule hits are words, not colours. "fired" puts the green square in front: a rule
// fired. "error" is inverted white.
const badgeVariants = cva('inline-flex flex-none items-center text-micro font-medium uppercase tracking-badge', {
  variants: {
    variant: {
      default: 'text-t40',
      strong: 'text-t80',
      fired: "text-t80 before:mr-[7px] before:size-[7px] before:bg-signal before:content-['']",
      error: 'bg-foreground px-1 tracking-caps text-black',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant = 'default', render, ...props }: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>({ className: cn(badgeVariants({ variant }), className) }, props),
    render,
    state: { slot: 'badge', variant },
  });
}

// Status codes: plain when fine, outlined for 4xx, inverted for 5xx and for a request that failed
// without one.
const statusVariants = cva('flex-none text-meta tabular-nums', {
  variants: {
    tone: {
      '2xx': 'text-t65',
      '3xx': 'text-t40',
      '4xx': 'px-1 text-foreground shadow-[inset_0_0_0_1px_var(--t50)]',
      '5xx': 'bg-foreground px-1 font-semibold text-black',
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

export function StatusCode({ status, failed = false, className }: { status: number | null | undefined; failed?: boolean; className?: string }) {
  return (
    <span data-slot="status" className={cn(statusVariants({ tone: statusTone(status, failed) }), className)}>
      {status || (failed ? 'ERR' : '—')}
    </span>
  );
}
