import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.ts';

// Institute's buttons: square, a 1px hairline, uppercase with wide tracking. The one filled button
// is the inverted white primary.
export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-[7px] border border-input bg-transparent font-medium whitespace-nowrap text-t80 uppercase transition-colors duration-120 select-none hover:bg-pressed hover:text-white disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none',
  {
    variants: {
      variant: {
        outline: '',
        primary:
          'border-foreground bg-foreground text-black hover:border-white hover:bg-white hover:text-black',
        ghost: 'border-transparent text-t50 hover:text-foreground',
        // a cell in a bar, with a hairline on its left (Import, Export, Clear)
        cell: 'border-0 border-l border-border font-normal text-t50 hover:text-foreground',
        // underlined words in running text, in the size and letter spacing of the text around them
        link: 'border-0 font-normal text-foreground normal-case underline decoration-t40 underline-offset-3 hover:bg-transparent hover:text-foreground hover:decoration-foreground',
      },
      size: {
        default: 'h-[30px] px-3 text-control tracking-caps',
        sm: 'h-[26px] px-[9px] text-label tracking-caps',
        lg: 'h-[34px] px-3 text-control tracking-caps',
        cell: 'h-full px-[13px] text-label tracking-wide',
        icon: 'size-[30px] border-0 p-0 text-t50 hover:text-foreground',
        'icon-sm': 'size-[26px] border-0 p-0 text-t50 hover:text-foreground',
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
