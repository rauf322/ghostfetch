import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../cn.ts';
import { CARD } from './card.tsx';
import { Icon } from './icon.tsx';

// Rows that open in place, one at a time, after T3 Code's settings: the row says what it is, and
// a click (or Enter or Space; each row is a Tab stop) opens its editor under it, with a chevron
// that turns to point down. The rows sit in a card. Base UI's Accordion does the screen-reader
// work: the row says whether it's open, and names its editor.
//
// A row can be split in two (after T3 Code's split rows, threadDetailsPanelStyles.ts): what it
// says opens its editor, as any row's does, and a control at its end (AccordionSplitButton) opens
// a menu of its own, a Tab stop too. The hairline between the two halves shows only while the
// pair is in use (under the pointer, with focus in either, its menu open), so at rest the row
// reads as a plain one; each half takes a second fill under the pointer.
export function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      multiple={false}
      className={cn(CARD, 'flex flex-col p-1', className)}
      {...props}
    />
  );
}

export function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn('group/row rounded-md data-open:bg-hover', className)}
      {...props}
    />
  );
}

// The row itself; its children lay out what it says, and the chevron comes last. `split`: the
// control at its end instead of the chevron, for a split row (above). The heading holds only what
// opens the editor.
export function AccordionTrigger({
  className,
  children,
  split,
  ...props
}: AccordionPrimitive.Trigger.Props & { split?: ReactNode }) {
  const trigger = (
    <AccordionPrimitive.Trigger
      data-slot="accordion-trigger"
      className={cn(
        'flex h-11 w-full items-center gap-3 rounded-md px-2.5 text-left outline-offset-[-2px] hover:bg-hover',
        split && 'rounded-r-none hover:bg-pressed',
        className,
      )}
      {...props}
    >
      {children}
      {!split && (
        <Icon
          name="forward"
          size={15}
          className="flex-none text-t30 transition-transform duration-150 group-data-open/row:rotate-90"
        />
      )}
    </AccordionPrimitive.Trigger>
  );
  if (!split)
    return (
      <AccordionPrimitive.Header className="m-0">{trigger}</AccordionPrimitive.Header>
    );
  return (
    <div
      data-slot="accordion-split"
      className="group/split flex items-center rounded-md hover:bg-hover has-[[data-popup-open]]:bg-hover"
    >
      <AccordionPrimitive.Header className="m-0 flex min-w-0 flex-1">
        {trigger}
      </AccordionPrimitive.Header>
      <span
        aria-hidden="true"
        data-slot="accordion-split-line"
        className="h-4 w-px flex-none bg-transparent transition-colors duration-100 group-hover/split:bg-input group-has-[:focus-visible]/split:bg-input group-has-[[data-popup-open]]/split:bg-input"
      />
      {split}
    </div>
  );
}

// The control at a split row's end: as tall as the row, with a chevron for its children. Render
// it as its menu's trigger, and give it an aria-label and a Tooltip.
export function AccordionSplitButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      data-slot="accordion-split-button"
      className={cn(
        'grid h-11 w-9 flex-none place-items-center rounded-r-md text-t30 outline-offset-[-2px] hover:bg-pressed hover:text-foreground data-popup-open:bg-pressed data-popup-open:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function AccordionPanel({ className, ...props }: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-panel"
      className={cn('flex flex-col gap-2.5 px-2.5 pt-1 pb-3', className)}
      {...props}
    />
  );
}
