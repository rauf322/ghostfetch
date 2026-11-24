import { Input as InputPrimitive } from '@base-ui/react/input';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';

// Text fields: a hairline box with soft corners whose border brightens while it's focused. "bare"
// fills a cell of a bar with no box of its own, like the search field and the rule's title, and is
// underlined while focused. No width of its own: it stretches to its column; in a row, give it
// flex-1.
export const inputVariants = cva(
  'min-w-0 bg-background text-foreground outline-none transition-[border-color] duration-120 placeholder:text-t30 disabled:opacity-45',
  {
    variants: {
      variant: {
        default:
          'rounded-md border border-input hover:border-t20 focus:border-t50 focus-visible:outline-none',
        bare: 'border-0 bg-transparent focus:shadow-[inset_0_-1px_0_var(--text)]',
      },
      size: {
        default: 'px-2.5 text-body',
        sm: 'px-2 text-small',
      },
    },
    compoundVariants: [
      { variant: 'default', size: 'default', class: 'h-9' },
      { variant: 'default', size: 'sm', class: 'h-8' },
      { variant: 'bare', class: 'h-full' },
    ],
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Input({
  className,
  variant,
  size,
  ...props
}: Omit<ComponentProps<'input'>, 'size'> & VariantProps<typeof inputVariants>) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(inputVariants({ variant, size }), className)}
      {...props}
    />
  );
}
