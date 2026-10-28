import { Select as SelectPrimitive } from '@base-ui/react/select';
import { cn } from '../cn.ts';

// A select in Institute's style: the trigger looks like an input, with a small solid triangle
// (kit.css's select-arrow) at its right end; the list is a hairline box with hairlines between
// options and a small white square next to the chosen one. Base UI does the keyboard: the arrow
// keys or Enter open it, arrows move, Enter chooses, Esc closes, typing jumps to an option.
export const Select = SelectPrimitive.Root;

export function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn('min-w-0 flex-1 truncate text-left', className)}
      {...props}
    />
  );
}

// The text stops 28px from the right edge, short of the triangle. "sm" is the size of a header
// row's fields.
export function SelectTrigger({
  className,
  variant = 'default',
  size = 'default',
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  variant?: 'default' | 'bare';
  size?: 'default' | 'sm';
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-variant={variant}
      data-size={size}
      className={cn(
        'flex w-full min-w-0 items-center bg-background pr-7 text-foreground outline-none select-arrow transition-[border-color] duration-120 select-none data-placeholder:text-t30',
        'data-[size=default]:h-8 data-[size=default]:pl-2.5 data-[size=default]:text-body data-[size=sm]:h-7 data-[size=sm]:pl-2 data-[size=sm]:text-small',
        'data-[variant=default]:border data-[variant=default]:border-input data-[variant=default]:hover:border-[#444] data-[variant=default]:focus-visible:border-foreground data-[variant=default]:data-popup-open:border-foreground',
        // in a cell of a bar, like the Traffic tab's page picker: underlined while focused
        'data-[variant=bare]:h-full data-[variant=bare]:bg-transparent data-[variant=bare]:pl-0 data-[variant=bare]:focus-visible:shadow-[inset_0_-1px_0_var(--text)]',
        className,
      )}
      {...props}
    >
      {children}
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 1,
  align = 'start',
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    'align' | 'side' | 'sideOffset' | 'alignItemWithTrigger'
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50 outline-none"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            'max-h-(--available-height) min-w-(--anchor-width) overflow-y-auto border border-input bg-background shadow-menu outline-none scroll-thin',
            className,
          )}
          {...props}
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'flex w-full items-center gap-[9px] border-b border-line-soft px-3 py-[9px] text-small text-t80 outline-none select-none last:border-b-0 data-highlighted:bg-pressed data-highlighted:text-white data-selected:text-white',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
        {children}
      </SelectPrimitive.ItemText>
      {/* The square alone: Base UI puts a ✔️ in it unless its children are null. */}
      <SelectPrimitive.ItemIndicator
        data-slot="select-item-indicator"
        className="size-1.5 flex-none bg-foreground"
      >
        {null}
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
