import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import type { ReactNode } from 'react';
import { cn } from '../cn.ts';

// The switch: a rounded track that turns green when on, its knob sliding across. (A rule's own
// switch is the dot, SignalSwitch.) SwitchPill is one with its words, in a small filled pill, as
// a rule's On/Off over its settings and Traffic's Recording: a click on either flips it.
export function Switch({
  className,
  size = 'default',
  ...props
}: SwitchPrimitive.Root.Props & { size?: 'sm' | 'default' }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'group/switch relative inline-block shrink-0 rounded-full bg-track transition-[background-color] duration-150 data-checked:bg-signal data-disabled:cursor-default data-disabled:opacity-45',
        'data-[size=default]:h-5 data-[size=default]:w-[34px] data-[size=sm]:h-4 data-[size=sm]:w-[26px]',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none absolute top-[2px] left-[2px] block rounded-full bg-knob transition-[translate,background-color] duration-150 group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-checked:bg-background group-data-[size=default]/switch:data-checked:translate-x-[14px] group-data-[size=sm]/switch:data-checked:translate-x-[10px]"
      />
    </SwitchPrimitive.Root>
  );
}

export function SwitchPill({
  className,
  title,
  children,
  ...props
}: SwitchPrimitive.Root.Props & { title?: string; children: ReactNode }) {
  return (
    <label
      data-slot="switch-pill"
      title={title}
      className={cn(
        'flex h-8 flex-none cursor-pointer items-center gap-2 rounded-md bg-card pr-1.5 pl-3 text-control font-medium text-t80',
        className,
      )}
    >
      {children}
      <Switch {...props} />
    </label>
  );
}
