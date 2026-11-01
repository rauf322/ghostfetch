import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';
import { cn } from '../cn.ts';
import { toggleVariants } from './toggle.tsx';

// Toggle buttons that share one value, like the status code chips: the chosen one is a raised
// pill, and clicking it again clears it. The arrow keys move between them. For a choice that
// always needs an answer, use Segmented.
export function ToggleGroup({ className, ...props }: ToggleGroupPrimitive.Props) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn('flex gap-0.5 rounded-[11px] bg-card p-[3px]', className)}
      {...props}
    />
  );
}

export function ToggleGroupItem({ className, ...props }: TogglePrimitive.Props) {
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(toggleVariants({ variant: 'segment', size: 'segment' }), className)}
      {...props}
    />
  );
}
