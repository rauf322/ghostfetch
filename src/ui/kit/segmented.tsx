import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { cn } from '../cn.ts';

// The segmented control: options side by side in a rounded track, the chosen one a raised pill.
// A radio group: one option is always chosen, the arrow keys move between options and choose as
// they go, and the group is one stop for Tab. The options share the track's width alike; when the
// text is too large for that (Appearance's Font and Text size), a label wraps at its spaces, and
// options that still don't fit side by side go on to another row, so no label is cut.
export function Segmented({ className, ...props }: RadioGroup.Props) {
  return (
    <RadioGroup
      data-slot="segmented"
      className={cn('flex flex-wrap gap-0.5 rounded-[11px] bg-card p-[3px]', className)}
      {...props}
    />
  );
}

// Each option is a <button> (Base UI gives it type="button"), so the browser centres its label as
// it does any button's, on one line or two. It's never narrower than its longest word.
export function SegmentedItem({ className, ...props }: Radio.Root.Props) {
  return (
    <Radio.Root
      data-slot="segmented-item"
      nativeButton
      render={(buttonProps) => <button {...buttonProps} />}
      className={cn(
        'min-h-7 min-w-min flex-1 rounded-[8px] px-2 py-0.5 text-control text-t50 transition-colors duration-120 select-none hover:text-foreground data-checked:bg-raised data-checked:font-medium data-checked:text-strong data-disabled:opacity-45',
        className,
      )}
      {...props}
    />
  );
}
