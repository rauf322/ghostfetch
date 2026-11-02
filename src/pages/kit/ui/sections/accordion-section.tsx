// Accordion: rows that open in place, one at a time, as a rule's settings do.
import { useState } from 'react';
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '../../../../shared/ui/kit/accordion.tsx';
import { CardHint } from '../../../../shared/ui/kit/card.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { Input } from '../../../../shared/ui/kit/input.tsx';
import { Cell, Output, Row } from '../cell.tsx';

export function AccordionSection() {
  const [open, setOpen] = useState<string[]>(['url']);
  return (
    <Cell title="Accordion" note="rows that open in place, one at a time">
      <Row
        label="A rule's settings (live: a click, Enter or Space opens a row and closes the open one)"
        className="flex flex-col gap-2"
      >
        <Accordion
          value={open}
          onValueChange={(value) => setOpen(value as string[])}
          data-testid="kit-accordion"
        >
          <AccordionItem value="url">
            <AccordionTrigger data-testid="kit-accordion-url">
              <Icon name="globe" size={17} className="flex-none text-t50" />
              <span className="flex-none text-body text-foreground">URL contains</span>
              <span className="ml-auto min-w-0 truncate text-right font-mono text-meta text-t80">
                /api/user
              </span>
            </AccordionTrigger>
            <AccordionPanel>
              <Input
                aria-label="URL pattern"
                defaultValue="/api/user"
                className="bg-background font-mono"
              />
              <CardHint>Matches when the full URL contains this text.</CardHint>
            </AccordionPanel>
          </AccordionItem>
          <AccordionItem value="method">
            <AccordionTrigger data-testid="kit-accordion-method">
              <Icon name="swap" size={17} className="flex-none text-t50" />
              <span className="flex-none text-body text-foreground">Method</span>
              <span className="ml-auto min-w-0 truncate text-right text-body text-t40">
                Any
              </span>
            </AccordionTrigger>
            <AccordionPanel>
              <CardHint>Only the requests made with this method.</CardHint>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      </Row>
      <Output testid="kit-accordion-open">open: {open[0] ?? 'none'}</Output>
    </Cell>
  );
}
