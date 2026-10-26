import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { cn } from '../../lib/utils.ts';

// Institute's square switch: a hairline box whose knob slides over and turns into the green square
// when on.
export function Switch({ className, size = 'default', ...props }: SwitchPrimitive.Root.Props & { size?: 'sm' | 'default' }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'group/switch relative inline-block shrink-0 border border-input transition-[border-color] duration-150 data-checked:border-t40 data-disabled:cursor-default data-disabled:opacity-45',
        'data-[size=default]:h-[14px] data-[size=default]:w-[26px] data-[size=sm]:h-3 data-[size=sm]:w-6',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none absolute top-[2px] left-[2px] block bg-t30 transition-[translate,background-color] duration-150 group-data-[size=default]/switch:size-2 group-data-[size=sm]/switch:size-1.5 data-checked:translate-x-3 data-checked:bg-signal"
      />
    </SwitchPrimitive.Root>
  );
}
