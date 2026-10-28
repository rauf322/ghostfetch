import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '../cn.ts';

// Buttons that stay pressed: a small square, hollow when off and the green square when on, as for
// Rec, Preserve, Matched and Vim. The "segment" look is for the options of a ToggleGroup.
export const toggleVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-[7px] whitespace-nowrap text-t50 uppercase transition-colors duration-120 select-none hover:bg-pressed hover:text-foreground disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        square:
          "before:size-[7px] before:flex-none before:shadow-[inset_0_0_0_1px_var(--t40)] before:content-[''] data-pressed:text-white data-pressed:before:bg-signal data-pressed:before:shadow-none",
        // inverted white while chosen; a plain button, so the browser centres the label
        segment:
          'block min-w-0 flex-1 overflow-hidden text-ellipsis data-pressed:bg-foreground data-pressed:font-medium data-pressed:text-black',
      },
      size: {
        // the size of a small button, hairline included (give it border-input to show the hairline)
        sm: 'h-[26px] border border-transparent px-[9px] text-label font-medium tracking-caps',
        // a cell in a bar, like the footer's Rec / Preserve / Matched
        cell: 'h-full border-l border-border px-[13px] text-label tracking-wide focus-visible:outline-offset-[-3px]',
        segment: 'h-7 px-1.5 text-label tracking-caps',
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
