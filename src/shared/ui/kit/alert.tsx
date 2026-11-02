import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';

// Banners: a notice, an error, and the bar that says Ghostfetch is off. An error gets a white
// border and an inverted "Error" label instead of red, and is announced at once (role="alert"); the
// others are read out when there's a pause (role="status").
const alertVariants = cva('text-small', {
  variants: {
    variant: {
      notice:
        'rounded-lg border border-border bg-card px-3.5 py-2.5 leading-[1.55] text-t80',
      error:
        "rounded-lg border border-foreground px-3.5 py-2.5 leading-[1.5] text-foreground before:mr-2 before:rounded-sm before:bg-foreground before:px-1.5 before:py-px before:text-micro before:font-semibold before:text-inverse before:content-['Error']",
      paused:
        'bg-foreground px-3.5 py-2 text-center text-control font-medium text-inverse',
    },
  },
  defaultVariants: { variant: 'notice' },
});

export function Alert({
  className,
  variant,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}
