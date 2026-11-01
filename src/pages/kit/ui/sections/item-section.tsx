// Items: rows of rules and of requests, as the two lists show them, one of each selected.
import { Badge, StatusCode } from '../../../../shared/ui/kit/badge.tsx';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '../../../../shared/ui/kit/item.tsx';
import { SignalSwitch } from '../../../../shared/ui/kit/signal-switch.tsx';
import { Method } from '../../../../shared/ui/list-detail.tsx';
import { Cell } from '../cell.tsx';

const RULES: {
  name: string;
  method: string;
  url: string;
  summary: string;
  on: boolean;
}[] = [
  {
    name: 'Logged-in admin user',
    method: 'GET',
    url: '/api/user',
    summary: 'Replace · 200',
    on: true,
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
    <Cell title="Item" note="rule rows and request rows" wide>
      <div className="grid grid-cols-2 gap-6">
        <ul className="m-0 list-none py-1">
          {RULES.map((rule, position) => (
            <Item key={rule.name} variant="rule" selected={position === 1} off={!rule.on}>
              <SignalSwitch
                defaultChecked={rule.on}
                aria-label={`Turn “${rule.name}” on or off`}
                className="-my-0.5 -ml-[9px] self-start"
              />
              <ItemContent>
                <ItemTitle>{rule.name}</ItemTitle>
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
        <ul className="m-0 list-none rounded-lg bg-card p-1">
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
                    `${entry.host} · fetch`
                  )}
                </span>
              </span>
              <span className="flex flex-col items-end gap-0.5">
                <StatusCode status={entry.status} />
                <span className="font-mono text-label text-t40 tabular-nums">
                  {entry.ms != null ? `${entry.ms} ms` : ''}
                </span>
              </span>
            </Item>
          ))}
        </ul>
      </div>
    </Cell>
  );
}
