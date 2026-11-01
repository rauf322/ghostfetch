import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '../cn.ts';

// Buttons: a hairline pill with soft corners, in sentence case. The one filled button is the
// inverted white primary.
export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-[7px] rounded-md border border-input bg-transparent font-medium whitespace-nowrap text-t80 transition-colors duration-120 select-none hover:bg-pressed hover:text-white disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none',
  {
    variants: {
      variant: {
        outline: '',
        primary:
          'border-foreground bg-foreground font-semibold text-black hover:border-white hover:bg-white hover:text-black',
        ghost: 'border-transparent text-t50 hover:text-foreground',
        // a quiet button in a list's footer (Import, Export, Clear)
        cell: 'border-0 font-normal text-t50 hover:text-foreground',
        // underlined words in running text, in the size of the text around them
        link: 'rounded-none border-0 font-normal text-foreground underline decoration-t40 underline-offset-3 hover:bg-transparent hover:text-foreground hover:decoration-foreground',
      },
      size: {
        default: 'h-8 px-3 text-control',
        sm: 'h-7 px-2.5 text-label',
        lg: 'h-9 px-3.5 text-control',
        cell: 'h-8 px-2.5 text-control',
        icon: 'size-8 border-0 p-0 text-t50 hover:text-foreground',
        'icon-sm': 'size-7 border-0 p-0 text-t50 hover:text-foreground',
        inline: 'p-0',
      },
    },
    defaultVariants: { variant: 'outline', size: 'default' },
  },
);

export function Button({
  className,
  variant = 'outline',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
