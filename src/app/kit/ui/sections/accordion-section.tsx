// Accordion: rows that open in place, one at a time, as a rule's settings do; and a row split in
// two, as Status's, whose chevron opens a menu of its own.
import { useState } from 'react';
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionSplitButton,
  AccordionTrigger,
} from '../../../../ui/kit/accordion.tsx';
import { CardHint } from '../../../../ui/kit/card.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../../../ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../../ui/kit/icon.tsx';
import { Input } from '../../../../ui/kit/input.tsx';
import { Tooltip } from '../../../../ui/kit/tooltip.tsx';
import { Cell, Output, Row } from '../cell.tsx';

const CODES = ['200 OK', '404 Not Found', '500 Internal Server Error'];

export function AccordionSection() {
  const [open, setOpen] = useState<string[]>(['url']);
  const [code, setCode] = useState(CODES[0]!);
  return (
    <Cell title="Accordion" note="rows that open in place, one at a time">
      <Row
        label="A rule's settings (live: a click, Enter or Space opens a row and closes the open one; Status's chevron opens a menu of its own)"
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
          <AccordionItem value="status">
            <AccordionTrigger
              data-testid="kit-accordion-status"
              split={
                <DropdownMenu>
                  <Tooltip label="Common status codes">
                    <DropdownMenuTrigger
                      render={
                        <AccordionSplitButton
                          aria-label="Common status codes"
                          data-testid="kit-accordion-codes"
                        />
                      }
                    >
                      <Icon name="down" size={15} />
                    </DropdownMenuTrigger>
                  </Tooltip>
                  <DropdownMenuContent>
                    <DropdownMenuRadioGroup
                      aria-label="Status code"
                      value={code}
                      onValueChange={(next: string) => setCode(next)}
                    >
                      {CODES.map((each) => (
                        <DropdownMenuRadioItem
                          key={each}
                          value={each}
                          closeOnClick
                          data-testid={`kit-code-${each.slice(0, 3)}`}
                        >
                          {each}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            >
              <Icon name="hash" size={17} className="flex-none text-t50" />
              <span className="flex-none text-body text-foreground">Status</span>
              <span className="ml-auto min-w-0 truncate text-right text-body text-t65">
                {code}
              </span>
            </AccordionTrigger>
            <AccordionPanel>
              <CardHint>The status code the page gets.</CardHint>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      </Row>
      <Output testid="kit-accordion-open">open: {open[0] ?? 'none'}</Output>
      <Output testid="kit-accordion-code">status: {code}</Output>
    </Cell>
  );
}
