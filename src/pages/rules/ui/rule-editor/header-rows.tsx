// Set or remove headers, one row each: the operation, the name and (to set) the value, side by
// side, or the value on a line of its own where there's less than 380 px; under a row the page
// won't get, why it's skipped. `pick` is the rule's list these rows are (the Headers row's: the
// headers of the response).
import { useRef } from 'react';
import { flushSync } from 'react-dom';
import { editRule, headerProblem } from '../../../../shared/api/index.ts';
import type { HeaderRow, Rule } from '../../../../shared/api/index.ts';
import { cn } from '../../../../shared/ui/cn.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { CardHint } from '../../../../shared/ui/kit/card.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { Input } from '../../../../shared/ui/kit/input.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../shared/ui/kit/select.tsx';

const OP_ITEMS = [
  { value: 'set', label: 'Set' },
  { value: 'remove', label: 'Remove' },
];

export function HeaderRows({
  rule,
  pick,
}: {
  rule: Rule;
  pick: (rule: Rule) => HeaderRow[];
}) {
  const list = useRef<HTMLDivElement>(null);
  const edit = (change: (current: Rule) => void) => editRule(rule.id, change);

  function add() {
    // Drawn at once, so the new row's name field is there to take the cursor.
    flushSync(() =>
      edit((current) => {
        pick(current).push({ op: 'set', name: '', value: '' });
      }),
    );
    [...list.current!.querySelectorAll<HTMLInputElement>('[data-row-name]')]
      .at(-1)
      ?.focus();
  }

  return (
    <div ref={list} className="@container flex flex-col items-start gap-1.5">
      {pick(rule).map((row, index) => (
        <div
          key={index}
          className="grid w-full grid-cols-[92px_minmax(0,1fr)_auto] gap-1.5 @[380px]:grid-cols-[92px_minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <Select
            items={OP_ITEMS}
            value={row.op}
            onValueChange={(op) =>
              edit((current) => {
                pick(current)[index]!.op = op as HeaderRow['op'];
              })
            }
          >
            <SelectTrigger size="sm" aria-label="Operation" className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OP_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            size="sm"
            data-row-name
            list="header-names"
            aria-label="Header name"
            placeholder="Header name"
            value={row.name}
            onChange={(event) =>
              edit((current) => {
                pick(current)[index]!.name = event.target.value;
              })
            }
            className={cn(
              'bg-background font-mono text-meta',
              row.op === 'remove' && '@[380px]:col-span-2',
            )}
          />
          {row.op !== 'remove' && (
            <Input
              size="sm"
              className="col-start-2 row-start-2 bg-background font-mono text-meta @[380px]:col-start-3 @[380px]:row-start-1"
              aria-label="Header value"
              placeholder="Value"
              value={row.value}
              onChange={(event) =>
                edit((current) => {
                  pick(current)[index]!.value = event.target.value;
                })
              }
            />
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            title="Remove header"
            className="col-start-3 row-start-1 @[380px]:col-start-4"
            onClick={() =>
              edit((current) => {
                pick(current).splice(index, 1);
              })
            }
          >
            <Icon name="close" size={14} />
          </Button>
          {headerProblem(row) && (
            // On a line of its own under the row, as wide as it.
            <CardHint tone="bad" className="col-span-full px-0.5">
              {headerProblem(row)}
            </CardHint>
          )}
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={add}>
        <Icon name="plus" size={14} /> Add header
      </Button>
    </div>
  );
}
