import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { cn } from '../cn.ts';

// The segmented control: options side by side in one hairline box, the chosen one inverted white.
// A radio group: one option is always chosen, the arrow keys move between options and choose as
// they go, and the group is one stop for Tab.
export function Segmented({ className, ...props }: RadioGroup.Props) {
  return (
    <RadioGroup
      data-slot="segmented"
      className={cn('flex border border-input', className)}
      {...props}
    />
  );
}

// Each option is a <button> (Base UI gives it type="button"), so the browser centres its label as
// it does any button's.
export function SegmentedItem({ className, ...props }: Radio.Root.Props) {
  return (
    <Radio.Root
      data-slot="segmented-item"
      nativeButton
      render={(buttonProps) => <button {...buttonProps} />}
      className={cn(
        'h-7 min-w-0 flex-1 truncate px-1.5 text-label text-t50 uppercase tracking-caps transition-colors duration-120 select-none not-first:border-l not-first:border-input hover:bg-pressed hover:text-foreground data-checked:bg-foreground data-checked:font-medium data-checked:text-black data-disabled:opacity-45',
        className,
      )}
      {...props}
    />
  );
}
