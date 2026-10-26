import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils.ts';

// The top bar's tabs: cells divided by hairlines, the active one underlined in white. A count next
// to the label dims with its tab. Base UI does the keyboard: the arrow keys move between tabs,
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
      className={cn('flex h-full', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        'group/tab flex h-full items-center gap-[7px] border-l border-border px-[9px] text-control whitespace-nowrap text-t40 uppercase tracking-caps hover:bg-hover hover:text-t80 data-active:text-white data-active:shadow-[inset_0_-1px_0_var(--text)]',
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
        'tracking-normal text-t30 group-data-active/tab:text-t50 empty:hidden',
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
