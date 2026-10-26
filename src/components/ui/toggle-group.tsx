import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';
import { cn } from '../../lib/utils.ts';
import { toggleVariants } from './toggle.tsx';

// Toggle buttons that share one value, like the status code chips: the chosen one is inverted
// white, and clicking it again clears it. The arrow keys move between them. For a choice that
// always needs an answer, use Segmented.
export function ToggleGroup({ className, ...props }: ToggleGroupPrimitive.Props) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn('flex border border-input', className)}
      {...props}
    />
  );
}

export function ToggleGroupItem({ className, ...props }: TogglePrimitive.Props) {
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        toggleVariants({ variant: 'segment', size: 'segment' }),
        'not-first:border-l not-first:border-input',
        className,
      )}
      {...props}
    />
  );
}
