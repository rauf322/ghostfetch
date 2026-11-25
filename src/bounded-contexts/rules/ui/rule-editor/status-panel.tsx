// The Status row's editor: the status code a rule sends (typed, with its name beside it, or picked
// from the common ones, grouped by class), and what an empty one means for the body mode. And the
// menu at the row's end (StatusMenu): the row is split in two (the kit's accordion), what it says
// opening the editor, its chevron a short menu of the most common codes, picked at once.
import { Fragment } from 'react';
import { editRule } from '../../index.ts';
import type { Rule } from '../../index.ts';
import { AccordionSplitButton } from '../../../../ui/kit/accordion.tsx';
import { CardHint } from '../../../../ui/kit/card.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../../ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../../ui/kit/icon.tsx';
import { Input } from '../../../../ui/kit/input.tsx';
import { FieldLabel } from '../../../../ui/kit/label.tsx';
import { ToggleGroup, ToggleGroupItem } from '../../../../ui/kit/toggle-group.tsx';
import { Tooltip } from '../../../../ui/kit/tooltip.tsx';
import { statusLabel, statusName } from '../../../../lib/index.ts';
import { STATUS_GROUPS, presetName } from '../status-codes.ts';

const setStatus = (rule: Rule, status: string) =>
  editRule(rule.id, (current) => {
    current.response.status = status;
  });

export function StatusPanel({ rule }: { rule: Rule }) {
  const { response } = rule;
  const replaces = response.bodyMode === 'replace';
  return (
    <>
      <label className="flex min-w-0 flex-col gap-[5px]">
        <FieldLabel>Status code</FieldLabel>
        <span className="flex items-center gap-3">
          <Input
            type="number"
            min={200}
            max={599}
            data-testid="status-code"
            value={response.status}
            placeholder={replaces ? '200' : 'Keep'}
            onChange={(event) => setStatus(rule, event.target.value)}
            className="w-[88px] bg-background font-mono tabular-nums"
          />
          <span data-testid="status-name" className="truncate text-body text-t65">
            {statusName(response.status)}
          </span>
        </span>
      </label>
      <CardHint>
        {replaces
          ? 'Sent with your body. Leave it empty to send 200 OK.'
          : "Replaces the server's status. Leave it empty to keep it."}
      </CardHint>
      {STATUS_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1.5">
          <FieldLabel>{group.label}</FieldLabel>
          {/* Click the chosen code again to clear it. */}
          <ToggleGroup
            aria-label={group.label}
            value={[response.status]}
            onValueChange={(values) => setStatus(rule, (values as string[])[0] ?? '')}
            className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-1 bg-transparent p-0"
          >
            {group.codes.map((code) => (
              <ToggleGroupItem
                key={code}
                value={String(code)}
                data-testid={`status-${code}`}
                title={statusLabel(code)}
                className="group/code flex h-8 items-center justify-start gap-2 bg-background px-2.5"
              >
                <span className="font-mono text-meta text-foreground tabular-nums">
                  {code}
                </span>
                <span className="truncate text-label text-t40 group-data-pressed/code:text-t65">
                  {presetName(code)}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ))}
    </>
  );
}

// The menu's codes, by class, and its value for the server's own status.
const COMMON = [
  [200, 201, 204],
  [400, 401, 403, 404],
  [500, 503],
];
const SERVERS = 'server';
// Its rows a little closer than a menu's usual 36 px: ten of them fit under the row, or over it,
// in a window 760 px tall, where Status's row sits in its middle.
const ROW = 'py-1.5';

// The common codes, each with its name ("404 Not Found"), the one the page gets checked: the one
// the rule sets, or with none, 200 for a body of your own and the server's own for one kept, as
// the row says ("200 OK", "Server's"). Picking one sets it and shuts the menu. A rule that keeps
// the server's body keeps its status too until it's given one: there, the menu starts with the
// server's status, checked while it's kept, which clears the code to keep it again.
export function StatusMenu({ rule }: { rule: Rule }) {
  const { response } = rule;
  const replaces = response.bodyMode === 'replace';
  const value = response.status.trim() || (replaces ? '200' : SERVERS);
  return (
    <DropdownMenu>
      <Tooltip label="Common status codes">
        <DropdownMenuTrigger
          render={
            <AccordionSplitButton
              aria-label="Common status codes"
              data-testid="status-menu"
            />
          }
        >
          <Icon name="down" size={15} />
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent className="min-w-[200px]">
        <DropdownMenuRadioGroup
          aria-label="Status code"
          value={value}
          onValueChange={(next: string) => setStatus(rule, next === SERVERS ? '' : next)}
        >
          {!replaces && (
            <>
              <DropdownMenuRadioItem
                value={SERVERS}
                closeOnClick
                data-testid="status-menu-server"
                className={ROW}
              >
                Server's status
              </DropdownMenuRadioItem>
              <DropdownMenuSeparator />
            </>
          )}
          {COMMON.map((codes, index) => (
            <Fragment key={codes[0]}>
              {index > 0 && <DropdownMenuSeparator />}
              {codes.map((code) => (
                <DropdownMenuRadioItem
                  key={code}
                  value={String(code)}
                  closeOnClick
                  data-testid={`status-menu-${code}`}
                  className={ROW}
                >
                  <span className="w-8 flex-none font-mono text-meta text-t80 tabular-nums">
                    {code}
                  </span>{' '}
                  <span className="min-w-0 truncate">{statusName(code)}</span>
                </DropdownMenuRadioItem>
              ))}
            </Fragment>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
