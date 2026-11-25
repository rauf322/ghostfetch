// Items: rows of rules and of requests, as the two lists show them, one of each selected. A rule
// starts with its switch, the green dot, and its slot at the right of its name (ItemSlot) says
// what it did on the page and when, and nothing while it hasn't answered, when its name steps
// back (quiet); under the pointer, with keyboard focus on the row or in it, or while its ⋯ menu is
// open, the slot shows its actions (ItemAction): turn it on or off, as its dot does, and the menu.
// The rule rows take focus, with a ring inside their edge, and a right-click on one (or the
// ContextMenu key, or Shift+F10, on the one with focus) opens its menu (ContextMenu); the search
// field over them keeps the browser's. Their dots share one tooltip (SharedTooltip), and the two
// that say the same are described by one hidden copy of the words. The requests sit in a card
// (ItemList), as Traffic's groups do, each with its slot on two lines (ItemSlot stacked): its
// status over how long it took, and in their place, under the pointer, while its right-click menu
// is open, and for the second one of them says it copied, its actions: Mock this response, Copy
// URL and Copy as cURL, the two copies a check for that second (useCopied). A URL that doesn't fit
// is cut in its middle, so its end stays (MiddleTruncate).
import { useRef, useState } from 'react';
import { formatDuration } from '../../../../lib/index.ts';
import { Badge, StatusCode } from '../../../../ui/kit/badge.tsx';
import { useCopied } from '../../../../ui/kit/copy-button.tsx';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '../../../../ui/kit/context-menu.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../../ui/kit/icon.tsx';
import { Input } from '../../../../ui/kit/input.tsx';
import {
  Item,
  ItemAction,
  ItemContent,
  ItemDescription,
  ItemList,
  ItemSlot,
  ItemTitle,
} from '../../../../ui/kit/item.tsx';
import { MiddleTruncate } from '../../../../ui/kit/middle-truncate.tsx';
import { SignalSwitch } from '../../../../ui/kit/signal-switch.tsx';
import {
  SharedTooltip,
  Tooltip,
  TooltipTrigger,
  createTooltipHandle,
} from '../../../../ui/kit/tooltip.tsx';
import { Method } from '../../../../ui/list-detail.tsx';
import { Cell } from '../cell.tsx';

// The tooltip the rule rows' dots share.
const DOTS = createTooltipHandle();

const RULES: {
  name: string;
  method: string;
  url: string;
  summary: string;
  on: boolean;
  // What it did on the page, and how long ago it last did.
  did?: string;
  ago?: string;
}[] = [
  {
    name: 'Logged-in admin user',
    method: 'GET',
    url: '/api/user',
    summary: 'Replace · 200',
    on: true,
    did: '2 mocked · 1 failed',
    ago: '4m',
  },
  {
    name: 'Slow team page',
    method: 'ANY',
    url: '^/api/team/(.*)',
    summary: "Server's body · 2 s",
    on: true,
  },
  {
    name: 'Checkout fails',
    method: 'POST',
    url: '/api/checkout',
    summary: 'Replace · 500 · 1200 ms',
    on: false,
  },
];
const REQUESTS: {
  method: string;
  path: string;
  host: string;
  status: number | null;
  ms: number | null;
  action?: string;
  rule?: string;
}[] = [
  {
    method: 'GET',
    path: '/api/user',
    host: 'localhost:3000',
    status: 200,
    ms: 3,
    action: 'Mocked',
    rule: 'Logged-in admin user',
  },
  {
    method: 'GET',
    path: '/api/team/projects',
    host: 'localhost:3000',
    status: 200,
    ms: 2014,
    action: 'Modified',
    rule: 'Slow team page',
  },
  {
    method: 'POST',
    path: '/v1/track',
    host: 'api.segment.io',
    status: null,
    ms: 18,
  },
  {
    method: 'GET',
    path: '/api/team/members',
    host: 'localhost:3000',
    status: 401,
    ms: 35,
  },
  {
    method: 'GET',
    path: '/api/billing/invoices',
    host: 'localhost:3000',
    status: 500,
    ms: 212,
  },
];

export function ItemSection() {
  // Which rules are on: their dots switch them, as in the editor's list, and so do their rows'
  // Turn off and Turn on.
  const [on, setOn] = useState(() => RULES.map((rule) => rule.on));
  // The row whose right-click menu is open.
  const [menuFor, setMenuFor] = useState(0);
  const turn = (position: number, next: boolean) =>
    setOn((was) => was.map((value, index) => (index === position ? next : value)));
  return (
    <Cell title="Item" note="rule rows, and request rows in a card" wide>
      <div className="grid grid-cols-2 gap-6">
        <ContextMenu>
          <ContextMenuTrigger
            data-testid="kit-rules-area"
            className="flex flex-col gap-2"
            onContextMenu={(event) => {
              const row = (event.target as Element).closest(
                '[data-testid=kit-rules] > li',
              );
              if (!row) {
                event.preventBaseUIHandler();
                return;
              }
              setMenuFor([...row.parentElement!.children].indexOf(row));
            }}
          >
            <Input
              data-testid="kit-rules-search"
              aria-label="Search the rules"
              placeholder="Search the rules"
              className="mx-1.5 w-auto"
            />
            <ul data-testid="kit-rules" className="m-0 list-none py-1">
              {RULES.map((rule, position) => (
                <Item
                  key={rule.name}
                  variant="rule"
                  selected={position === 0}
                  off={!on[position]}
                  tabIndex={0}
                >
                  <TooltipTrigger
                    handle={DOTS}
                    label={
                      on[position]
                        ? 'On. Click to turn this rule off'
                        : 'Off. Click to turn this rule on'
                    }
                  >
                    <SignalSwitch
                      aria-label={`Turn “${rule.name}” on or off`}
                      checked={on[position]}
                      onCheckedChange={(next) => turn(position, next)}
                      className="-my-0.5 -ml-[9px] self-start"
                    />
                  </TooltipTrigger>
                  <ItemContent>
                    <div className="flex min-w-0 items-center gap-2">
                      {/* As in the editor's list: the name keeps 7 letters' room, or 60% of the
                      line, and one that's on but hasn't answered steps back. */}
                      <ItemTitle
                        quiet={on[position] && !rule.did && position !== 0}
                        className="min-w-[min(7em,60%)] flex-1"
                      >
                        {rule.name}
                      </ItemTitle>
                      <ItemSlot
                        actions={
                          <RuleActions
                            name={rule.name}
                            on={on[position]}
                            onTurn={(next) => turn(position, next)}
                          />
                        }
                      >
                        {on[position] && rule.did && (
                          <>
                            <span className="text-signal">{rule.did}</span>{' '}
                            <span className="text-t50">{`· ${rule.ago}`}</span>
                          </>
                        )}
                      </ItemSlot>
                    </div>
                    <ItemDescription>
                      {rule.method !== 'ANY' && (
                        <span className="flex-none font-mono font-medium text-t80">
                          {rule.method}
                        </span>
                      )}
                      <MiddleTruncate
                        text={rule.url}
                        className="max-w-[62%] flex-none font-mono text-t65"
                      />
                      <span className="min-w-0 flex-[0_10_auto] truncate text-t40">
                        {rule.summary}
                      </span>
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ul>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <DropdownMenuItem
              data-testid="kit-row-menu-turn"
              onClick={() => turn(menuFor, !on[menuFor])}
            >
              <Icon name="power" /> {on[menuFor] ? 'Turn off' : 'Turn on'}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Icon name="copy" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive">
              <Icon name="close" /> Delete
            </DropdownMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <SharedTooltip handle={DOTS} />
        <RequestRows />
      </div>
    </Cell>
  );
}

// The requests, in a card, with a right-click menu that marks its row as having it open, as
// Traffic's list does (its items here do nothing).
function RequestRows() {
  const marked = useRef<HTMLElement | null>(null);
  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) return;
        marked.current?.removeAttribute('data-context-open');
        marked.current = null;
      }}
    >
      <ContextMenuTrigger
        render={<ItemList data-testid="kit-requests" />}
        onContextMenu={(event) => {
          const row = (event.target as Element).closest<HTMLElement>(
            '[data-testid=kit-requests] > li',
          );
          if (!row) {
            event.preventBaseUIHandler();
            return;
          }
          marked.current?.removeAttribute('data-context-open');
          row.setAttribute('data-context-open', '');
          marked.current = row;
        }}
      >
        {REQUESTS.map((entry, position) => (
          <Item
            key={entry.path + entry.method}
            variant="request"
            selected={position === 2}
            className="mx-0"
          >
            <Method matched={Boolean(entry.action)}>{entry.method}</Method>
            <span className="flex min-w-0 flex-col gap-0.5">
              <MiddleTruncate
                text={entry.path}
                className="font-mono text-body text-foreground"
              />
              <span className="flex min-w-0 items-center gap-1 overflow-hidden text-label whitespace-nowrap text-t40">
                {entry.action ? (
                  <>
                    <Badge variant="fired">{entry.action}</Badge>
                    <span className="flex-none text-signal">by</span>
                    <span className="truncate pl-0.5 text-t65">{entry.rule}</span>
                  </>
                ) : (
                  `${entry.host} · fetch()`
                )}
              </span>
            </span>
            <ItemSlot
              stacked
              className="min-w-19"
              actions={<RequestActions url={`https://${entry.host}${entry.path}`} />}
            >
              <StatusCode status={entry.status} />
              <span className="font-mono text-label text-t40 tabular-nums">
                {entry.ms != null ? formatDuration(entry.ms) : ''}
              </span>
            </ItemSlot>
          </Item>
        ))}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <DropdownMenuItem>
          <Icon name="wand" /> Mock this response
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Icon name="link" /> Copy URL
        </DropdownMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// A request row's actions, in its slot: Mock this response (here it does nothing), and two copies,
// each a check for the second after it copied.
function RequestActions({ url }: { url: string }) {
  return (
    <>
      <Tooltip label="Mock this response">
        <ItemAction aria-label="Mock this response">
          <Icon name="wand" size={14} />
        </ItemAction>
      </Tooltip>
      <CopyAction label="Copy URL" icon="link" what="the URL" text={url} />
      <CopyAction
        label="Copy as cURL"
        icon="terminal"
        what="the cURL command"
        text={`curl '${url}'`}
      />
    </>
  );
}

function CopyAction({
  label,
  icon,
  what,
  text,
}: {
  label: string;
  icon: 'link' | 'terminal';
  what: string;
  text: string;
}) {
  const { copied, copy, live } = useCopied(what);
  return (
    <>
      <Tooltip label={label}>
        <ItemAction
          aria-label={label}
          data-copied={copied || undefined}
          onClick={() => copy(text)}
        >
          <Icon
            name={copied ? 'check' : icon}
            size={14}
            className={copied ? 'text-signal' : undefined}
          />
        </ItemAction>
      </Tooltip>
      {live}
    </>
  );
}

// A rule row's actions, in its slot: turn it on or off, and its ⋯ menu (here two items that do
// nothing).
function RuleActions({
  name,
  on,
  onTurn,
}: {
  name: string;
  on: boolean;
  onTurn: (on: boolean) => void;
}) {
  const turn = on ? 'Turn off' : 'Turn on';
  return (
    <>
      <Tooltip label={turn}>
        <ItemAction aria-label={`${turn} “${name}”`} onClick={() => onTurn(!on)}>
          <Icon name="power" size={14} />
        </ItemAction>
      </Tooltip>
      <DropdownMenu>
        <Tooltip label="More actions">
          <DropdownMenuTrigger
            render={<ItemAction aria-label={`More actions for “${name}”`} />}
          >
            <Icon name="more" size={15} />
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent>
          <DropdownMenuItem>
            <Icon name="copy" /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive">
            <Icon name="close" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
