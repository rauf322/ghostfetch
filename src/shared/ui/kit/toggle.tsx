import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '../cn.ts';

// Buttons that stay pressed: a small rounded mark, hollow when off and green when on, as for Keep
// on reload and Vim keys. The "segment" look is for the options of a ToggleGroup.
export const toggleVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-[7px] whitespace-nowrap text-t50 transition-colors duration-120 select-none hover:bg-pressed hover:text-foreground disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        square:
          "before:size-2 before:flex-none before:rounded-[3px] before:shadow-[inset_0_0_0_1px_var(--t40)] before:content-[''] data-pressed:text-white data-pressed:before:bg-signal data-pressed:before:shadow-none",
        // a raised pill while chosen; a plain button, so the browser centres the label
        segment:
          'block min-w-0 flex-1 overflow-hidden text-ellipsis data-pressed:bg-raised data-pressed:font-medium data-pressed:text-white',
      },
      size: {
        // the size of a small button, hairline included (give it border-input to show the hairline)
        sm: 'h-7 rounded-md border border-transparent px-2.5 text-label font-medium',
        segment: 'h-7 rounded-[8px] px-2 text-control',
      },
    },
    defaultVariants: { variant: 'square', size: 'sm' },
  },
);

export function Toggle({
  className,
  variant = 'square',
  size = 'sm',
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}
