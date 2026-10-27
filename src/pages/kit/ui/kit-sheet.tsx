// The kit page's one view: every component of src/shared/ui/kit/ in its states. Hover and focus are
// shown by adding the classes those states add, so they appear in a still screenshot. The rest is
// live, and test/kit.mjs drives it with the keyboard and the mouse (data-testid="kit-..."). With
// ?open the select and the menu are also shown held open, for screenshots.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BODY_MODES, TYPES } from '../../../entities/rule/index.ts';
import type { RuleType } from '../../../entities/rule/index.ts';
import { cn } from '../../../shared/lib/class-names/index.ts';
import { Alert } from '../../../shared/ui/kit/alert.tsx';
import { Badge, StatusCode } from '../../../shared/ui/kit/badge.tsx';
import { Button } from '../../../shared/ui/kit/button.tsx';
import { Card, CardHint, CardTitle } from '../../../shared/ui/kit/card.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../shared/ui/kit/dropdown-menu.tsx';
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '../../../shared/ui/kit/empty.tsx';
import { ICON_NAMES, Icon } from '../../../shared/ui/kit/icon.tsx';
import { Input } from '../../../shared/ui/kit/input.tsx';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemNumber,
  ItemTitle,
} from '../../../shared/ui/kit/item.tsx';
import { FieldLabel, Label } from '../../../shared/ui/kit/label.tsx';
import { Segmented, SegmentedItem } from '../../../shared/ui/kit/segmented.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../shared/ui/kit/select.tsx';
import { Switch } from '../../../shared/ui/kit/switch.tsx';
import {
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from '../../../shared/ui/kit/tabs.tsx';
import { Toaster, createToastManager, toast } from '../../../shared/ui/kit/toast.tsx';
import { ToggleGroup, ToggleGroupItem } from '../../../shared/ui/kit/toggle-group.tsx';
import { Toggle } from '../../../shared/ui/kit/toggle.tsx';

const METHODS = ['ANY', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => ({
  value,
  label: value === 'ANY' ? 'Any method' : value,
}));
const STATUS_PRESETS = [200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500, 503];
const HOVER = 'bg-pressed text-white';
const FOCUS = 'outline outline-1 outline-offset-2 outline-foreground';

const RULES: {
  name: string;
  type: RuleType;
  method: string;
  url: string;
  summary: string;
  on: boolean;
}[] = [
  {
    name: 'Logged-in admin user',
    type: 'response',
    method: 'GET',
    url: '/api/user',
    summary: 'Replace · 200',
    on: true,
  },
  {
    name: 'Prod API → local',
    type: 'redirect',
    method: 'ANY',
    url: '^https://api\\.acme\\.dev/(.*)',
    summary: '→ http://localhost:4000/\\1',
    on: true,
  },
  {
    name: 'Checkout fails',
    type: 'response',
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
    method: 'POST',
    path: '/v1/track',
    host: 'api.segment.io',
    status: null,
    ms: null,
    action: 'Blocked',
    rule: 'Block analytics',
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

function Cell({
  index,
  title,
  note,
  wide,
  children,
}: {
  index: number;
  title: string;
  note?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className={cn('border-b-0 bg-background pb-5', wide && 'col-span-2')}>
      <CardTitle index={index} note={note}>
        {title}
      </CardTitle>
      <div className="flex flex-col gap-4 pt-1">{children}</div>
    </Card>
  );
}

function Row({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div className={className ?? 'flex flex-wrap items-center gap-2'}>{children}</div>
    </div>
  );
}

// What a live component last did, for the eye and for the test.
function Output({ testid, children }: { testid: string; children: ReactNode }) {
  return (
    <output data-testid={testid} className="text-meta text-t50">
      {children}
    </output>
  );
}

// Two toasts shown in place and kept, to see both looks at once.
function InlineToasts() {
  const [info] = useState(createToastManager);
  const [error] = useState(createToastManager);
  useEffect(() => {
    const shown = [
      info.add({ title: 'Rule deleted', actionProps: { children: 'Undo' }, timeout: 0 }),
      error.add({
        title: "That file isn't a Ghostfetch export",
        type: 'error',
        timeout: 0,
      }),
    ];
    return () => {
      info.close(shown[0]);
      error.close(shown[1]);
    };
  }, [info, error]);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Toaster toastManager={info} inline />
      <Toaster toastManager={error} inline />
    </div>
  );
}

// The select and the menu held open, for screenshots (?open), with room below for their lists.
function OpenPopups() {
  return (
    <Row
      label="Held open: a select, and a menu with Delete highlighted"
      className="flex h-[250px] items-start gap-[70px]"
    >
      <div className="w-[150px]">
        <Select items={METHODS} defaultValue="GET" open modal={false}>
          <SelectTrigger aria-label="HTTP method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {METHODS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DropdownMenu open modal={false}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="border border-border bg-pressed text-foreground"
              aria-label="More actions"
            />
          }
        >
          <Icon name="more" size={18} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem>
            <Icon name="copy" /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Icon name="export" /> Export this rule
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            className="bg-foreground text-black [&_[data-slot=icon]]:text-black"
          >
            <Icon name="close" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Row>
  );
}

export function KitSheet({ open }: { open: boolean }) {
  const [presses, setPresses] = useState(0);
  const [vim, setVim] = useState(true);
  const [ruleOn, setRuleOn] = useState(true);
  const [view, setView] = useState('rules');
  const [type, setType] = useState('response');
  const [status, setStatus] = useState<string[]>(['404']);
  const [url, setUrl] = useState('/api/user');
  const [method, setMethod] = useState('GET');
  const [action, setAction] = useState('');
  const [undone, setUndone] = useState(0);

  const deleteRule = () => {
    const id = toast.add({
      title: 'Deleted “Checkout fails”',
      actionProps: {
        children: 'Undo',
        onClick: () => {
          setUndone((count) => count + 1);
          toast.close(id);
        },
      },
    });
  };

  return (
    <div className="grid w-[1180px] grid-cols-2 gap-px border border-border bg-border">
      <Cell index={1} title="Button" note="outline · primary · ghost · cell · link">
        <Row label="Default · hover · primary · primary hover · ghost · disabled">
          <Button>Import</Button>
          <Button className={HOVER}>Import</Button>
          <Button variant="primary">
            <Icon name="plus" size={14} /> New rule
          </Button>
          <Button variant="primary" className="border-white bg-white">
            <Icon name="plus" size={14} /> New rule
          </Button>
          <Button variant="ghost">Format</Button>
          <Button disabled>Export</Button>
        </Row>
        <Row label="Small · icon · icon hover · focus · link">
          <Button size="sm">Format</Button>
          <Button variant="ghost" size="icon" aria-label="More">
            <Icon name="more" size={18} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back"
            className="bg-pressed text-foreground"
          >
            <Icon name="back" size={18} />
          </Button>
          <Button className={FOCUS}>Focused</Button>
          <Button variant="link" size="inline">
            open Traffic
          </Button>
        </Row>
        <Row
          label="Full width, with a row of secondary actions (request detail)"
          className="flex flex-col gap-2"
        >
          <Button variant="primary" size="lg" className="w-full">
            <Icon name="wand" size={14} /> Mock this response
          </Button>
          <div className="grid auto-cols-fr grid-flow-col border border-input">
            <Button className="h-[30px] border-0 px-1.5 text-label tracking-[0.08em] text-t65">
              <Icon name="rule" size={13} /> Open rule
            </Button>
            <Button className="h-[30px] border-0 border-l border-input px-1.5 text-label tracking-[0.08em] text-t65">
              <Icon name="copy" size={13} /> Copy URL
            </Button>
            <Button className="h-[30px] border-0 border-l border-input px-1.5 text-label tracking-[0.08em] text-t65">
              <Icon name="copy" size={13} /> Copy response
            </Button>
          </div>
        </Row>
        <Row label="Live: Enter, Space or a click">
          <Button
            data-testid="kit-button"
            onClick={() => setPresses((count) => count + 1)}
          >
            Press me
          </Button>
          <Output testid="kit-button-presses">
            {presses} {presses === 1 ? 'press' : 'presses'}
          </Output>
        </Row>
      </Cell>

      <Cell index={2} title="Toggle and switch" note="the green square means on">
        <Row
          label="Cells in a bar: Rec on, Preserve off, Matched hover"
          className="flex h-[38px] items-stretch border border-border"
        >
          <Toggle size="cell" className="border-l-0" defaultPressed>
            Rec
          </Toggle>
          <Toggle size="cell">Preserve</Toggle>
          <Toggle size="cell" className="bg-pressed text-foreground">
            Matched
          </Toggle>
          <Button variant="cell" size="cell" className="ml-auto">
            <Icon name="clear" size={13} /> Clear
          </Button>
        </Row>
        <Row label="Vim off · on (live: Space)">
          <Toggle>Vim</Toggle>
          <Toggle data-testid="kit-toggle" pressed={vim} onPressedChange={setVim}>
            Vim
          </Toggle>
        </Row>
        <Row label="Switch off · on · small off · small on · disabled · focus">
          <Switch aria-label="Off" />
          <Switch aria-label="On" defaultChecked />
          <Switch size="sm" aria-label="Small off" />
          <Switch size="sm" aria-label="Small on" defaultChecked />
          <Switch aria-label="Disabled" disabled defaultChecked />
          <Switch aria-label="Focused" defaultChecked className={FOCUS} />
        </Row>
        <Row label="Live, with its words: Space, or a click on the switch or the words">
          <label
            data-testid="kit-switch-label"
            className="flex cursor-pointer items-center gap-2 text-small text-t80"
          >
            <Switch
              data-testid="kit-switch"
              checked={ruleOn}
              onCheckedChange={setRuleOn}
            />
            <span data-testid="kit-switch-words">Rule {ruleOn ? 'on' : 'off'}</span>
          </label>
        </Row>
      </Cell>

      <Cell index={3} title="Tabs" note="the top bar's (live: arrows move, Enter opens)">
        <Tabs
          value={view}
          onValueChange={(next) => setView(next as string)}
          data-testid="kit-tabs"
          className="w-[400px] flex-col border border-border"
        >
          <div className="flex h-10 items-stretch border-b border-border">
            <div className="flex items-center gap-2 pr-[9px] pl-3 text-meta font-bold whitespace-nowrap text-t65 uppercase tracking-[0.08em]">
              <img
                src="/icons/icon32.png"
                width={16}
                height={16}
                alt=""
                className="block"
              />
              Ghostfetch
            </div>
            <TabsList>
              <TabsTrigger value="rules">
                Rules <TabsCount>08</TabsCount>
              </TabsTrigger>
              <TabsTrigger value="traffic">
                Traffic <TabsCount>14</TabsCount>
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="rules" className="p-3.5 text-small text-t50">
            The rule list.
          </TabsContent>
          <TabsContent value="traffic" className="p-3.5 text-small text-t50">
            The traffic log.
          </TabsContent>
        </Tabs>
        <Row
          label="Section labels: a list's name and its count"
          className="flex h-[34px] w-[400px] items-center justify-between border border-border px-3.5"
        >
          <Label>Rules</Label>
          <Label className="tracking-wider">6 / 8 on</Label>
        </Row>
      </Cell>

      <Cell
        index={4}
        title="Segmented and toggle group"
        note="one answer always · chips that clear"
      >
        <Row label="Segmented (live: arrow keys choose)" className="flex flex-col gap-2">
          <Segmented
            value={type}
            onValueChange={(next) => setType(next as string)}
            aria-label="Rule type"
            data-testid="kit-segmented"
          >
            {Object.entries(TYPES).map(([key, item]) => (
              <SegmentedItem key={key} value={key}>
                {item.short}
              </SegmentedItem>
            ))}
          </Segmented>
          <Segmented defaultValue="merge" aria-label="Response body">
            {Object.entries(BODY_MODES).map(([key, item]) => (
              <SegmentedItem key={key} value={key}>
                {item.short ?? item.label}
              </SegmentedItem>
            ))}
          </Segmented>
        </Row>
        <Row
          label="Toggle group (live: click the chosen code again to clear it)"
          className="flex flex-col gap-2"
        >
          <ToggleGroup
            value={status}
            onValueChange={(next) => setStatus(next as string[])}
            aria-label="Status code"
            data-testid="kit-chips"
            className="grid grid-cols-6 border-0 border-t border-l"
          >
            {STATUS_PRESETS.map((code) => (
              <ToggleGroupItem
                key={code}
                value={String(code)}
                data-testid={`kit-chip-${code}`}
                className="h-[26px] border-r border-b border-input px-0 text-meta tracking-[inherit] not-first:border-l-0"
              >
                {code}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Row>
        <Output testid="kit-choices">
          {TYPES[type as RuleType].short} · status {status[0] ?? 'none'}
        </Output>
      </Cell>

      <Cell index={5} title="Input">
        <Row label="Empty · filled · hover · focus" className="grid grid-cols-4 gap-2">
          <Input placeholder="/api/users" aria-label="Empty" />
          <Input defaultValue="/api/user" aria-label="Filled" />
          <Input defaultValue="/api/user" aria-label="Hover" className="border-[#444]" />
          <Input
            defaultValue="/api/user"
            aria-label="Focus"
            className="border-foreground"
          />
        </Row>
        <Row
          label="Small · in a cell · title"
          className="grid grid-cols-3 items-stretch gap-2"
        >
          <Input
            size="sm"
            placeholder="Paste a URL to test the pattern"
            aria-label="Test URL"
          />
          <div className="relative flex h-[42px] items-center border border-border">
            <span className="pointer-events-none absolute left-3.5 flex text-t30">
              <Icon name="search" size={14} />
            </span>
            <Input
              variant="bare"
              type="search"
              placeholder="Search rules"
              aria-label="Search rules"
              className="flex-1 pl-9"
            />
          </div>
          <div className="flex h-11 border border-border">
            <Input
              variant="bare"
              defaultValue="Logged-in admin user"
              aria-label="Rule name"
              className="flex-1 px-3.5 text-title font-medium text-white"
            />
          </div>
        </Row>
        <Row label="Live" className="flex items-center gap-3">
          <Input
            data-testid="kit-input"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-label="URL pattern"
            className="w-[260px]"
          />
          <Output testid="kit-input-value">{url || 'empty'}</Output>
        </Row>
        <Row label="Hint · problem" className="flex flex-col gap-1">
          <CardHint>
            Matches when the full URL contains this text, e.g. /api/users
          </CardHint>
          <CardHint tone="bad">Invalid regular expression: missing )</CardHint>
        </Row>
      </Cell>

      <Cell
        index={6}
        title="Select and menu"
        note="arrows move, Enter chooses, Esc closes"
      >
        <Row label="Live: a select and a menu" className="flex items-center gap-3">
          <div className="w-[150px]">
            <Select
              items={METHODS}
              value={method}
              onValueChange={(next) => setMethod(next as string)}
            >
              <SelectTrigger aria-label="HTTP method" data-testid="kit-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((item) => (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    data-testid={`kit-select-${item.value}`}
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="border border-border"
                  aria-label="More actions"
                  data-testid="kit-menu"
                />
              }
            >
              <Icon name="more" size={18} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setAction('Duplicate')}>
                <Icon name="copy" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAction('Export')}>
                <Icon name="export" /> Export this rule
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setAction('Delete')}
                data-testid="kit-menu-delete"
              >
                <Icon name="close" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Output testid="kit-picked">
            {method} · {action ? `ran ${action}` : 'no menu item run yet'}
          </Output>
        </Row>
        {open && <OpenPopups />}
      </Cell>

      <Cell index={7} title="Badge and status" note="words, not colours">
        <Row label="Rule types">
          {Object.values(TYPES).map((item) => (
            <Badge key={item.short}>{item.short}</Badge>
          ))}
        </Row>
        <Row
          label="A rule fired · rule error"
          className="flex flex-wrap items-center gap-4"
        >
          <Badge variant="fired">Mocked</Badge>
          <Badge variant="fired">Redirected</Badge>
          <Badge variant="fired">Blocked</Badge>
          <Badge variant="error">Rule error</Badge>
        </Row>
        <Row
          label="Status codes: 2xx · 3xx · 4xx · 5xx · network error · none"
          className="flex flex-wrap items-center gap-4"
        >
          <StatusCode status={200} />
          <StatusCode status={204} />
          <StatusCode status={304} />
          <StatusCode status={401} />
          <StatusCode status={404} />
          <StatusCode status={500} />
          <StatusCode status={null} failed />
          <StatusCode status={null} />
        </Row>
      </Cell>

      <Cell index={8} title="Alert and toast" note="errors are inverted white, not red">
        <Alert>Recording is paused. Rules still apply.</Alert>
        <Alert variant="error">
          Chrome rejected this rule: the regular expression is too complex.
        </Alert>
        <Alert variant="paused">
          Ghostfetch is off. Rules aren't applied until you turn it back on.
        </Alert>
        <InlineToasts />
        <Row
          label="Live: one toast at a time, with Undo"
          className="flex items-center gap-3"
        >
          <Button size="sm" data-testid="kit-toast-button" onClick={deleteRule}>
            Delete a rule
          </Button>
          <Output testid="kit-toast-undone">
            undone {undone} {undone === 1 ? 'time' : 'times'}
          </Output>
        </Row>
      </Cell>

      <Cell index={9} title="Item" note="rule rows and request rows" wide>
        <div className="grid grid-cols-2 gap-6">
          <ul className="m-0 list-none border border-b-0 border-border p-0">
            {RULES.map((rule, index) => (
              <Item key={rule.name} variant="rule" selected={index === 1} off={!rule.on}>
                <ItemNumber>{String(index + 1).padStart(2, '0')}</ItemNumber>
                <ItemContent>
                  <ItemTitle>{rule.name}</ItemTitle>
                  <ItemDescription>
                    <Badge>{TYPES[rule.type].short}</Badge>
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
                <Switch
                  size="sm"
                  defaultChecked={rule.on}
                  aria-label={`Turn “${rule.name}” on or off`}
                />
              </Item>
            ))}
          </ul>
          <ul className="m-0 list-none border border-b-0 border-border p-0">
            {REQUESTS.map((entry, index) => (
              <Item
                key={entry.path + entry.method}
                variant="request"
                hit={Boolean(entry.action)}
                selected={index === 2}
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

      <Cell index={10} title="Empty" note="on the dotted grid" wide>
        <div className="flex h-[230px] border border-border bg-dots">
          <Empty>
            <EmptyMedia>
              <img src="/icons/icon128.png" width={48} height={48} alt="" />
            </EmptyMedia>
            <EmptyTitle>Select a rule to edit it</EmptyTitle>
            <EmptyDescription>
              Rules apply on every site Ghostfetch runs on while it's switched on. The
              quickest start: open <b>Traffic</b>, click a request and choose{' '}
              <b>Mock this response</b>.
            </EmptyDescription>
            <Button variant="primary">
              <Icon name="plus" size={14} /> New rule
            </Button>
          </Empty>
        </div>
      </Cell>

      <Cell index={11} title="Icons" note="the same shapes as src/shared/lib/icons" wide>
        <div
          data-testid="kit-icons"
          className="grid grid-cols-10 border-t border-l border-border"
        >
          {ICON_NAMES.map((name) => (
            <div
              key={name}
              className="flex flex-col items-center gap-2 border-r border-b border-border py-3 text-t80"
            >
              <Icon name={name} size={18} />
              <span className="text-micro text-t40">{name}</span>
            </div>
          ))}
        </div>
      </Cell>
    </div>
  );
}
