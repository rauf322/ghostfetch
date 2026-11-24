import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';
import { Icon } from './icon.tsx';

// Menus: a rounded card with a hairline border and a deep shadow, its items rounded rows. A
// destructive item turns inverted when highlighted. Base UI does the keyboard: Enter or the arrow
// keys open it on its first item, arrows move, Enter runs an item, Esc closes, and focus goes back
// to the button that opened it; the right arrow opens a row's own menu (DropdownMenuSub), the
// left arrow closes it.
export const DropdownMenu = MenuPrimitive.Root;

const POPUP =
  'max-h-(--available-height) min-w-[210px] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-menu outline-none';
const ITEM =
  'flex w-full items-center gap-[9px] rounded-md px-2.5 py-2 text-left text-small text-t80 outline-none select-none data-highlighted:bg-raised data-highlighted:text-strong data-disabled:opacity-45 [&_[data-slot=icon]]:text-t40';

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
          className={cn(POPUP, className)}
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
        ITEM,
        'data-[variant=destructive]:data-highlighted:bg-foreground data-[variant=destructive]:data-highlighted:text-inverse data-[variant=destructive]:data-highlighted:[&_[data-slot=icon]]:text-inverse',
        className,
      )}
      {...props}
    />
  );
}

// A row that opens a menu of its own beside it, as Theme does, on hover, a click or the right
// arrow. It stays lit while that menu is open, and ends in a chevron.
export const DropdownMenuSub = MenuPrimitive.SubmenuRoot;

export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      className={cn(
        ITEM,
        'data-popup-open:bg-raised data-popup-open:text-strong',
        className,
      )}
      {...props}
    >
      {children}
      <Icon name="forward" size={14} className="-mr-1" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

// The menu a DropdownMenuSubTrigger opens: beside its row, top edges lined up, and on the other
// side when there's no room on this one (the ⋯ menus sit at the right edge of the window).
export function DropdownMenuSubContent({
  className,
  ...props
}: MenuPrimitive.Popup.Props) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        sideOffset={6}
        alignOffset={-5}
        collisionPadding={8}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-sub-content"
          className={cn(POPUP, className)}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

// A few choices of which one is in use (DropdownMenuRadioGroup, with a value and
// onValueChange), each with a check at its right end while it's the one. Picking one leaves the
// menu open.
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(ITEM, 'data-checked:text-strong', className)}
      {...props}
    >
      {children}
      <MenuPrimitive.RadioItemIndicator className="ml-auto flex pl-3 text-foreground">
        {/* Not data-slot="icon", which the row dims: the check is as bright as its text. */}
        <Icon name="check" size={14} data-slot="check" />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
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
