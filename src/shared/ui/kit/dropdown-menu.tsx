import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';

// Menus: a rounded card with a hairline border and a deep shadow, its items rounded rows. A
// destructive item turns inverted white when highlighted. Base UI does the keyboard: Enter or the
// arrow keys open it on its first item, arrows move, Enter runs an item, Esc closes, and focus goes
// back to the button that opened it.
export const DropdownMenu = MenuPrimitive.Root;

export function DropdownMenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

// Hangs 4px under its button, right edges lined up, even against the edge of the window. `anchor`
// hangs it from another element instead, like the toolbar cell around the New rule button.
export function DropdownMenuContent({
  align = 'end',
  side = 'bottom',
  sideOffset = 4,
  anchor,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, 'align' | 'side' | 'sideOffset' | 'anchor'>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        side={side}
        sideOffset={sideOffset}
        anchor={anchor}
        collisionPadding={0}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            'max-h-(--available-height) min-w-[210px] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-menu outline-none',
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  variant = 'default',
  ...props
}: MenuPrimitive.Item.Props & { variant?: 'default' | 'destructive' }) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        'flex w-full items-center gap-[9px] rounded-md px-2.5 py-2 text-left text-small text-t80 outline-none select-none data-highlighted:bg-raised data-highlighted:text-white data-disabled:opacity-45 [&_[data-slot=icon]]:text-t40',
        'data-[variant=destructive]:data-highlighted:bg-foreground data-[variant=destructive]:data-highlighted:text-black data-[variant=destructive]:data-highlighted:[&_[data-slot=icon]]:text-black',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dropdown-menu-label"
      className={cn('px-2.5 pt-2 pb-1 text-label font-medium text-t40', className)}
      {...props}
    />
  );
}
