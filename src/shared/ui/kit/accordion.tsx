import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import { cn } from '../cn.ts';
import { CARD } from './card.tsx';
import { Icon } from './icon.tsx';

// Rows that open in place, one at a time, after T3 Code's settings: the row says what it is, and
// a click (or Enter or Space; each row is a Tab stop) opens its editor under it, with a chevron
// that turns to point down. The rows sit in a card. Base UI's Accordion does the screen-reader
// work: the row says whether it's open, and names its editor.
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

// The row itself; its children lay out what it says, and the chevron comes last.
export function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="m-0">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'flex h-11 w-full items-center gap-3 rounded-md px-2.5 text-left outline-offset-[-2px] hover:bg-hover',
          className,
        )}
        {...props}
      >
        {children}
        <Icon
          name="forward"
          size={15}
          className="flex-none text-t30 transition-transform duration-150 group-data-open/row:rotate-90"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
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
