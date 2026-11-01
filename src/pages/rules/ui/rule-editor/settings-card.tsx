// A card of a rule's settings, one row each, after T3 Code's settings and Revolut's cards: what the
// setting is, its value on the right, and a click opens its editor in place, under the row. The
// rule editor gives its two cards one `open` row between them, so one editor is open at a time.
// Base UI's accordion does the keyboard: Enter or Space opens a row, and the arrow keys move
// between a card's rows.
import { Accordion } from '@base-ui/react/accordion';
import type { ReactNode } from 'react';
import { cn } from '../../../../shared/ui/cn.ts';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import type { IconName } from '../../../../shared/ui/kit/icon.tsx';

// A card with a grey label over it, like "When a request matches".
export function SettingsSection({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <h2 className="px-1 text-label font-medium text-t40">{label}</h2>
      {children}
    </section>
  );
}

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
    <Accordion.Root
      value={open ? [open] : []}
      onValueChange={(value) => onOpenChange((value[0] as string | undefined) ?? null)}
      className="flex flex-col rounded-lg bg-card p-1"
    >
      {children}
    </Accordion.Root>
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
    <Accordion.Item value={id} className="group/row rounded-md data-open:bg-hover">
      <Accordion.Header className="m-0">
        <Accordion.Trigger
          data-testid={`row-${id}`}
          className="flex h-11 w-full items-center gap-3 rounded-md px-2.5 text-left outline-offset-[-2px] hover:bg-hover"
        >
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
          <Icon
            name="forward"
            size={15}
            className="flex-none text-t30 transition-transform duration-150 group-data-open/row:rotate-90"
          />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Panel className="flex flex-col gap-2.5 px-2.5 pt-1 pb-3">
        {children}
      </Accordion.Panel>
    </Accordion.Item>
  );
}
