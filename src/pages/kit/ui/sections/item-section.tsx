// Items: rows of rules and of requests, as the two lists show them, one of each selected.
import { Badge, StatusCode } from '../../../../shared/ui/kit/badge.tsx';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemNumber,
  ItemTitle,
} from '../../../../shared/ui/kit/item.tsx';
import { SignalSwitch } from '../../../../shared/ui/kit/signal-switch.tsx';
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

export function ItemSection({ index }: { index: number }) {
  return (
    <Cell index={index} title="Item" note="rule rows and request rows" wide>
      <div className="grid grid-cols-2 gap-6">
        <ul className="m-0 list-none border border-b-0 border-border p-0">
          {RULES.map((rule, position) => (
            <Item key={rule.name} variant="rule" selected={position === 1} off={!rule.on}>
              <ItemNumber>{String(position + 1).padStart(2, '0')}</ItemNumber>
              <ItemContent>
                <ItemTitle>{rule.name}</ItemTitle>
                <ItemDescription>
                  {rule.method !== 'ANY' && (
                    <span className="flex-none text-control font-medium tracking-[0.04em] text-t80">
                      {rule.method}
                    </span>
                  )}
                  <span className="max-w-[62%] flex-none truncate text-t65">
                    {rule.url}
                  </span>
                  <span className="min-w-0 flex-[0_10_auto] truncate text-t30">
                    {rule.summary}
                  </span>
                </ItemDescription>
              </ItemContent>
              <SignalSwitch
                defaultChecked={rule.on}
                aria-label={`Turn “${rule.name}” on or off`}
                className="-mr-2"
              />
            </Item>
          ))}
        </ul>
        <ul className="m-0 list-none border border-b-0 border-border p-0">
          {REQUESTS.map((entry, position) => (
            <Item
              key={entry.path + entry.method}
              variant="request"
              hit={Boolean(entry.action)}
              selected={position === 2}
            >
              <span className="text-control font-medium tracking-[0.04em] text-t80">
                {entry.method}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-foreground">{entry.path}</span>
                <span className="flex min-w-0 items-center gap-[7px] overflow-hidden text-control whitespace-nowrap text-t30">
                  {entry.action ? (
                    <>
                      <Badge variant="fired">{entry.action}</Badge>
                      <span className="truncate text-t40">{entry.rule}</span>
                    </>
                  ) : (
                    entry.host
                  )}
                </span>
              </span>
              <StatusCode status={entry.status} />
              <span className="text-right text-control text-t30 tabular-nums">
                {entry.ms != null ? `${entry.ms} ms` : ''}
              </span>
            </Item>
          ))}
        </ul>
      </div>
    </Cell>
  );
}
