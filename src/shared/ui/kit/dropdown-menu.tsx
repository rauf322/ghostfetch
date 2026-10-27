import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/class-names/index.ts';

// Institute's menus: a black box with a hairline border and a deep shadow, one hairline between
// items. A destructive item turns inverted white when highlighted. Base UI does
// the keyboard: Enter or the arrow keys open it on its first item, arrows move, Enter runs an
// item, Esc closes, and focus goes back to the button that opened it.
export const DropdownMenu = MenuPrimitive.Root;

export function DropdownMenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

// Hangs 1px under its button, right edges lined up, even against the edge of the window. `anchor`
// hangs it from another element instead, like the toolbar cell around the New rule button.
export function DropdownMenuContent({
  align = 'end',
  side = 'bottom',
  sideOffset = 1,
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
            'max-h-(--available-height) min-w-[210px] overflow-y-auto border border-input bg-background shadow-menu outline-none',
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
        'flex w-full items-center gap-[9px] border-b border-line-soft px-3 py-[9px] text-left text-small text-t80 outline-none select-none last:border-b-0 data-highlighted:bg-pressed data-highlighted:text-white data-disabled:opacity-45 [&_[data-slot=icon]]:text-t40',
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
      className={cn('h-px bg-input', className)}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dropdown-menu-label"
      className={cn(
        'border-b border-line-soft px-3 py-2 text-label text-t40 uppercase tracking-label',
        className,
      )}
      {...props}
    />
  );
}
