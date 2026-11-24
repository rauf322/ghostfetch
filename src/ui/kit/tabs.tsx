import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';

// Pill tabs, as in the top bar and over a rule's settings: the active one is a filled pill. A count
// next to the label dims with its tab. Base UI does the keyboard: the arrow keys move between tabs,
// Enter or Space opens one.
export function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root data-slot="tabs" className={cn('flex', className)} {...props} />
  );
}

export function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('flex h-full items-center gap-0.5', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        'group/tab flex h-7 flex-none items-center gap-1.5 rounded-md px-2.5 text-control font-medium whitespace-nowrap text-t50 hover:bg-hover hover:text-t80 data-active:bg-pressed data-active:text-strong',
        className,
      )}
      {...props}
    />
  );
}

export function TabsCount({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="tabs-count"
      className={cn(
        'font-normal text-t30 tabular-nums group-data-active/tab:text-t50 empty:hidden',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn('outline-none', className)}
      {...props}
    />
  );
}
