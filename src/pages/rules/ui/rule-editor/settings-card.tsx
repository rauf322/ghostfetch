// A card of a rule's settings, one row each, after T3 Code's settings and Revolut's cards: what the
// setting is, its value on the right, and a click opens its editor in place, under the row (the
// kit's accordion). The rule editor gives its two cards one `open` row between them, so one
// editor is open at a time.
import type { ReactNode } from 'react';
import { cn } from '../../../../shared/ui/cn.ts';
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '../../../../shared/ui/kit/accordion.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import type { IconName } from '../../../../shared/ui/kit/icon.tsx';

export function SettingsCard({
  open,
  onOpenChange,
  children,
}: {
  // The open row's id, or null.
  open: string | null;
  onOpenChange: (id: string | null) => void;
  children: ReactNode;
}) {
  return (
    <Accordion
      value={open ? [open] : []}
      onValueChange={(value) => onOpenChange((value[0] as string | undefined) ?? null)}
    >
      {children}
    </Accordion>
  );
}

export function SettingRow({
  id,
  icon,
  label,
  value,
  code = false,
  quiet = false,
  children,
}: {
  id: string;
  icon: IconName;
  label: string;
  // The setting's value on the right: `code` in the monospace font (a URL, a method), `quiet` in
  // grey (a default such as "Any" or "None").
  value: ReactNode;
  code?: boolean;
  quiet?: boolean;
  // Its editor, shown under the row while it's open.
  children: ReactNode;
}) {
  return (
    <AccordionItem value={id}>
      <AccordionTrigger data-testid={`row-${id}`}>
        <Icon name={icon} size={17} className="flex-none text-t50" />
        <span className="flex-none text-body text-foreground">{label}</span>
        <span
          data-testid={`row-${id}-value`}
          className={cn(
            'ml-auto min-w-0 truncate text-right',
            code ? 'font-mono text-meta text-t80' : 'text-body',
            quiet ? 'text-t40' : !code && 'text-t65',
          )}
        >
          {value}
        </span>
      </AccordionTrigger>
      <AccordionPanel>{children}</AccordionPanel>
    </AccordionItem>
  );
}
