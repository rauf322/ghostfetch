// Items: rows of rules and of requests, as the two lists show them, one of each selected. A rule
// says at the right of its name what it did on the page, or Off, and nothing while it's on but
// hasn't answered. The requests sit in a card (ItemList), as Traffic's groups do.
import { formatDuration } from '../../../../shared/lib/index.ts';
import { Badge, StatusCode } from '../../../../shared/ui/kit/badge.tsx';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemList,
  ItemTitle,
} from '../../../../shared/ui/kit/item.tsx';
import { SignalDot } from '../../../../shared/ui/kit/signal-dot.tsx';
import { Method } from '../../../../shared/ui/list-detail.tsx';
import { Cell } from '../cell.tsx';

const RULES: {
  name: string;
  method: string;
  url: string;
  summary: string;
  on: boolean;
  // What it did on the page.
  did?: string;
}[] = [
  {
    name: 'Logged-in admin user',
    method: 'GET',
    url: '/api/user',
    summary: 'Replace · 200',
    on: true,
    did: '2 mocked',
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
  return (
    <Cell title="Item" note="rule rows, and request rows in a card" wide>
      <div className="grid grid-cols-2 gap-6">
        <ul className="m-0 list-none py-1">
          {RULES.map((rule, position) => (
            <Item key={rule.name} variant="rule" selected={position === 1} off={!rule.on}>
              <ItemContent>
                <div className="flex min-w-0 items-center gap-2">
                  <ItemTitle className="min-w-0">{rule.name}</ItemTitle>
                  {!rule.on ? (
                    <span className="ml-auto flex flex-none items-center gap-1.5 text-label text-t40">
                      <SignalDot on={false} />
                      Off
                    </span>
                  ) : (
                    rule.did && (
                      <span className="ml-auto flex flex-none items-center gap-1.5 text-label text-signal">
                        <SignalDot on />
                        {rule.did}
                      </span>
                    )
                  )}
                </div>
                <ItemDescription>
                  {rule.method !== 'ANY' && (
                    <span className="flex-none font-mono font-medium text-t80">
                      {rule.method}
                    </span>
                  )}
                  <span className="max-w-[62%] flex-none truncate font-mono text-t65">
                    {rule.url}
                  </span>
                  <span className="min-w-0 flex-[0_10_auto] truncate text-t40">
                    {rule.summary}
                  </span>
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ul>
        <ItemList>
          {REQUESTS.map((entry, position) => (
            <Item
              key={entry.path + entry.method}
              variant="request"
              selected={position === 2}
              className="mx-0"
            >
              <Method matched={Boolean(entry.action)}>{entry.method}</Method>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-mono text-body text-foreground">
                  {entry.path}
                </span>
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
              <span className="flex flex-col items-end gap-0.5">
                <StatusCode status={entry.status} />
                <span className="font-mono text-label text-t40 tabular-nums">
                  {entry.ms != null ? formatDuration(entry.ms) : ''}
                </span>
              </span>
            </Item>
          ))}
        </ItemList>
      </div>
    </Cell>
  );
}
