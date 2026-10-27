// Traffic tab: live log of the fetch/XHR calls in a tab, with a detail pane and
// "Mock this response", which turns a captured response into an editable rule.
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { METHODS, createRule } from '../../../entities/rule/index.ts';
import type { Method as HttpMethod, Rule } from '../../../entities/rule/index.ts';
import { setFlag, settingsStore } from '../../../entities/settings/index.ts';
import {
  isSiteEnabled,
  normalizeSite,
  siteOf,
  setSites,
  siteStore,
} from '../../../entities/site/index.ts';
import type { LogEntry } from '../../../entities/traffic/index.ts';
import { cn } from '../../../shared/lib/class-names/index.ts';
import { formatJson } from '../../../shared/lib/json/index.ts';
import { splitUrl } from '../../../shared/lib/url/index.ts';
import { CodeView } from '../../../shared/ui/code-editor/index.ts';
import { Alert } from '../../../shared/ui/kit/alert.tsx';
import { Badge, StatusCode } from '../../../shared/ui/kit/badge.tsx';
import { Button } from '../../../shared/ui/kit/button.tsx';
import { Card, CardHint, CardTitle } from '../../../shared/ui/kit/card.tsx';
import { Empty, EmptyDescription, EmptyTitle } from '../../../shared/ui/kit/empty.tsx';
import { Icon } from '../../../shared/ui/kit/icon.tsx';
import { Item } from '../../../shared/ui/kit/item.tsx';
import { Label } from '../../../shared/ui/kit/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../shared/ui/kit/select.tsx';
import { notify } from '../../../shared/ui/kit/toast.tsx';
import { Toggle } from '../../../shared/ui/kit/toggle.tsx';
import {
  BackButton,
  DetailPane,
  List,
  ListEmpty,
  ListPane,
  Method,
  PaneFooter,
  PaneHead,
  PaneScroll,
  PaneToolbar,
  SearchField,
  SectionRow,
  Split,
} from '../../../shared/ui/list-detail/index.ts';
import { createTrafficLog } from '../model/traffic-log.ts';

const PRESERVE = 'ghostfetch.preserveLog';
const ACTION_LABELS: Record<string, string> = {
  mocked: 'Mocked',
  modified: 'Modified',
  error: 'Rule error',
  redirect: 'Redirected',
  headers: 'Headers',
  block: 'Blocked',
};
const KIND_LABELS: Record<string, string> = {
  fetch: 'fetch()',
  xhr: 'XMLHttpRequest',
  xmlhttprequest: 'XHR / fetch',
  main_frame: 'Page',
  sub_frame: 'Iframe',
};
// The row of secondary actions under Mock this response: cells in one hairline box, quieter than
// other buttons (their words stay grey under the pointer).
const SECONDARY =
  'h-[30px] min-w-0 border-0 px-1.5 text-label tracking-[0.08em] text-t65 not-first:border-l not-first:border-input hover:text-t65';

interface TrafficPageProps {
  // The side panel follows the active tab; the editor in a tab keeps the tab it picked.
  followActiveTab: boolean;
  onMock: (draft: Rule) => void;
  onOpenRule: (id: string) => void;
  onCount: (count: number) => void;
}

// Memoized: it only draws again when its own log or settings change, not on every rule edit.
export const TrafficPage = memo(function TrafficPage({
  followActiveTab,
  onMock,
  onOpenRule,
  onCount,
}: TrafficPageProps) {
  const [log] = useState(() =>
    createTrafficLog({
      followActiveTab,
      preserve: () => localStorage.getItem(PRESERVE) === '1',
    }),
  );
  useEffect(() => {
    log.start();
    return () => log.stop();
  }, [log]);
  const traffic = useSyncExternalStore(log.subscribe, log.snapshot);
  const record = useSyncExternalStore(
    settingsStore.subscribe,
    () => settingsStore.state.record,
  );
  const sites = useSyncExternalStore(siteStore.subscribe, () => siteStore.state.sites);
  const [preserve, setPreserve] = useState(() => localStorage.getItem(PRESERVE) === '1');
  const [onlyMatched, setOnlyMatched] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { entries, targetId, targetUrl } = traffic;
  const selected = entries.find((entry) => entry.id === selectedId);
  const back = useCallback(() => setSelectedId(null), []);

  useEffect(() => onCount(entries.length), [entries.length, onCount]);

  const query = filter.trim().toLowerCase();
  const visible = entries
    .filter(
      (entry) =>
        (!onlyMatched || entry.ruleId) &&
        (!query ||
          `${entry.method} ${entry.url} ${entry.status ?? ''} ${entry.ruleName}`
            .toLowerCase()
            .includes(query)),
    )
    .toReversed();
  const hits = entries.filter((entry) => entry.action).length;

  let waiting: ReactNode = null;
  if (entries.length) waiting = 'No requests match the filter.';
  else if (traffic.connected && record)
    // Text that ends at a line break is a string, which oxfmt can't split at a space: each piece
    // stays one run of text, so it lines up to the pixel as in 0.5.1.
    waiting = (
      <>
        Waiting for requests… Use your app and its <code>fetch</code> and <code>XHR</code>
        {' calls show up here.'}
      </>
    );

  const host = siteOf(targetUrl);
  let notice: ReactNode = null;
  if (targetId == null) {
    notice = 'Open a web page in this window to see its requests.';
  } else if (!traffic.connected && host && !isSiteEnabled(sites, targetUrl)) {
    notice = (
      <>
        Ghostfetch is off on <b>{host}</b>
        {", so it doesn't capture or change anything there. "}
        <Button
          variant="link"
          size="inline"
          data-testid="enable-site"
          onClick={() => {
            const site = normalizeSite(host);
            if (site)
              setSites([...siteStore.state.sites, site]).then(() =>
                chrome.tabs.reload(targetId),
              );
          }}
        >
          {`Turn on for ${host}`}
        </Button>
      </>
    );
  } else if (!traffic.connecting && !traffic.connected) {
    notice = (
      <>
        {
          "Ghostfetch isn't running in this tab yet. That happens when the page was opened before Ghostfetch was installed or turned on for this site. "
        }
        <Button variant="link" size="inline" onClick={() => chrome.tabs.reload(targetId)}>
          Reload the page
        </Button>
      </>
    );
  } else if (!record) {
    notice = 'Recording is off, so new requests aren’t captured. Rules still apply.';
  }

  return (
    <Split>
      <ListPane picked={Boolean(selected)}>
        <PaneToolbar>
          <div className="flex min-w-0 flex-1 items-center gap-2.5 pl-3.5">
            <Label>Tab</Label>
            <Select
              items={traffic.tabs.map((tab) => ({
                value: String(tab.id),
                label: tab.title,
              }))}
              value={targetId == null ? null : String(targetId)}
              onValueChange={(value) => {
                setSelectedId(null);
                log.setTarget(value ? Number(value) : null);
              }}
            >
              <SelectTrigger
                variant="bare"
                data-testid="traffic-tab"
                aria-label="Tab to inspect"
                className="flex-1"
              >
                <SelectValue placeholder="No web pages open" />
              </SelectTrigger>
              <SelectContent>
                {traffic.tabs.map((tab) => (
                  <SelectItem key={tab.id} value={String(tab.id)}>
                    {tab.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PaneToolbar>
        <PaneToolbar>
          <SearchField
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by URL, method, status, rule"
            title="Filter by URL, method, status or rule name"
            aria-label="Filter requests"
          />
        </PaneToolbar>
        {notice && (
          <Alert data-testid="traffic-notice" className="mx-3.5 mt-2.5 flex-none">
            {notice}
          </Alert>
        )}
        <SectionRow>
          <Label>{`${entries.length} ${entries.length === 1 ? 'request' : 'requests'}`}</Label>
          <Label className="tracking-wider">{hits ? `${hits} matched a rule` : ''}</Label>
        </SectionRow>

        <List>
          {visible.length
            ? visible.map((entry) => (
                <RequestRow
                  key={entry.id}
                  entry={entry}
                  selected={entry.id === selectedId}
                  onSelect={setSelectedId}
                />
              ))
            : waiting && (
                <ListEmpty>
                  <p>{waiting}</p>
                </ListEmpty>
              )}
        </List>

        <PaneFooter>
          <Toggle
            size="cell"
            pressed={record}
            onPressedChange={(on) => setFlag('record', on)}
            title="Capture requests. Rules apply either way."
            className="border-l-0"
          >
            Rec
          </Toggle>
          <Toggle
            size="cell"
            pressed={preserve}
            onPressedChange={(on) => {
              setPreserve(on);
              localStorage.setItem(PRESERVE, on ? '1' : '0');
            }}
            title="Keep requests when the page reloads"
          >
            Preserve
          </Toggle>
          <Toggle
            size="cell"
            pressed={onlyMatched}
            onPressedChange={setOnlyMatched}
            title="Only show requests a rule matched"
          >
            Matched
          </Toggle>
          <Button
            variant="cell"
            size="cell"
            title="Clear the log"
            className="ml-auto"
            onClick={() => {
              log.clear();
              setSelectedId(null);
            }}
          >
            <Icon name="clear" size={13} />
            Clear
          </Button>
        </PaneFooter>
      </ListPane>

      <DetailPane picked={Boolean(selected)}>
        {selected ? (
          <RequestDetail
            entry={selected}
            onBack={back}
            onMock={onMock}
            onOpenRule={onOpenRule}
          />
        ) : (
          <Empty>
            <EmptyTitle className="mt-0">Select a request</EmptyTitle>
            <EmptyDescription>
              {'Click a request to see its response, then turn it into a rule with '}
              <b>Mock this response</b>.
            </EmptyDescription>
          </Empty>
        )}
      </DetailPane>
    </Split>
  );
});

// Entries come from the page, so everything in them is shown as text, never as HTML. The second
// line says which rule fired, or else where the request went.
const RequestRow = memo(function RequestRow({
  entry,
  selected,
  onSelect,
}: {
  entry: LogEntry;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { host, path } = splitUrl(entry.url);
  return (
    <Item
      variant="request"
      data-testid="request"
      hit={Boolean(entry.action)}
      selected={selected}
      title={entry.url}
      onClick={() => onSelect(entry.id)}
    >
      <Method>{entry.method}</Method>
      <span className="flex min-w-0 flex-col">
        <span data-testid="request-path" className="truncate text-foreground">
          {path}
        </span>
        <span className="flex min-w-0 items-center gap-[7px] overflow-hidden text-control whitespace-nowrap text-t30">
          {entry.action ? (
            <>
              <ActionBadge entry={entry} title={entry.error || entry.ruleName} />
              <span className="truncate text-t40">{entry.error || entry.ruleName}</span>
            </>
          ) : (
            `${host}${entry.frame ? ' · in iframe' : ''}`
          )}
        </span>
      </span>
      <StatusCode status={entry.status} failed={Boolean(entry.error)} />
      <span className="text-right text-control text-t30 tabular-nums">
        {entry.duration != null ? `${entry.duration} ms` : ''}
      </span>
    </Item>
  );
});

// Memoized on the entry, which never changes: a long body is only formatted once.
const RequestDetail = memo(function RequestDetail({
  entry,
  onBack,
  onMock,
  onOpenRule,
}: {
  entry: LogEntry;
  onBack: () => void;
  onMock: (draft: Rule) => void;
  onOpenRule: (id: string) => void;
}) {
  const { path } = splitUrl(entry.url);
  const pretty = useMemo(() => formatJson(entry.responseBody), [entry.responseBody]);
  const requestPretty = useMemo(() => formatJson(entry.requestBody), [entry.requestBody]);
  const canMock = entry.kind === 'fetch' || entry.kind === 'xhr';

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    notify('Copied to clipboard');
  }

  return (
    <>
      <PaneHead>
        <BackButton title="All requests" data-testid="request-back" onClick={onBack} />
        <Method className="self-center pl-3.5">{entry.method}</Method>
        <span
          title={entry.url}
          className="min-w-0 flex-1 self-center truncate px-2.5 text-title font-medium text-white"
        >
          {path}
        </span>
        <StatusCode
          status={entry.status}
          failed={Boolean(entry.error)}
          className="mx-3.5 self-center"
        />
      </PaneHead>
      <PaneScroll>
        {entry.error && (
          <Alert variant="error" className="mx-3.5 mt-3.5">
            {entry.error}
          </Alert>
        )}
        <div className="flex flex-col gap-2 border-b border-border px-3.5 py-3">
          {canMock && (
            <Button
              variant="primary"
              size="lg"
              data-testid="mock"
              className="w-full"
              onClick={() => {
                onMock(ruleFromEntry(entry));
                if (entry.truncated)
                  notify(
                    'The response was over 1 MB, so the mock only has the first 1 MB',
                    { kind: 'error', duration: 5000 },
                  );
              }}
            >
              <Icon name="wand" />
              Mock this response
            </Button>
          )}
          <div className="grid auto-cols-fr grid-flow-col border border-input">
            {entry.ruleId && (
              <Button className={SECONDARY} onClick={() => onOpenRule(entry.ruleId!)}>
                <Icon name="rule" size={13} />
                Open rule
              </Button>
            )}
            <Button className={SECONDARY} onClick={() => copy(entry.url)}>
              <Icon name="copy" size={13} />
              Copy URL
            </Button>
            {entry.responseBody && (
              <Button
                className={SECONDARY}
                onClick={() => copy(pretty ?? entry.responseBody)}
              >
                <Icon name="copy" size={13} />
                Copy response
              </Button>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 px-3.5 pt-1 pb-3">
          <Meta label="URL" wide className="break-all">
            {entry.url}
          </Meta>
          <Meta label="Type">{`${KIND_LABELS[entry.kind] || entry.kind}${entry.frame ? ` in iframe ${entry.frame}` : ''}`}</Meta>
          {entry.duration != null && (
            <Meta label="Duration">{`${entry.duration} ms`}</Meta>
          )}
          <Meta label="Time">{new Date(entry.time).toLocaleTimeString()}</Meta>
          {entry.contentType && <Meta label="Content-Type">{entry.contentType}</Meta>}
          {entry.ruleId && (
            <Meta label="Rule" wide>
              <ActionBadge entry={entry} />
              {entry.ruleName}
            </Meta>
          )}
        </dl>
        <Card>
          <CardTitle note={entry.truncated ? 'first 1 MB only' : undefined}>
            Response body
          </CardTitle>
          {entry.responseBody ? (
            <CodeView text={pretty ?? entry.responseBody} highlight={pretty !== null} />
          ) : (
            <CardHint>
              {canMock
                ? 'No body captured (empty, binary, or a streaming response).'
                : 'Chrome handled this request directly, so its body isn’t available.'}
            </CardHint>
          )}
        </Card>
        {entry.requestBody && (
          <Card>
            <CardTitle>Request body</CardTitle>
            <CodeView
              text={requestPretty ?? entry.requestBody}
              highlight={requestPretty !== null}
            />
          </Card>
        )}
      </PaneScroll>
    </>
  );
});

// One fact about a request: a small label over its value.
function Meta({
  label,
  wide,
  className,
  children,
}: {
  label: string;
  wide?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn('min-w-0 border-b border-line-soft py-2', wide && 'col-span-full')}
    >
      <dt className="mb-[3px] text-micro uppercase tracking-badge text-t40">{label}</dt>
      <dd
        className={cn(
          'flex min-w-0 flex-wrap items-center gap-2 text-foreground',
          className,
        )}
      >
        {children}
      </dd>
    </div>
  );
}

// What a rule did to a request: the green square and a word, or an inverted "Rule error".
function ActionBadge({ entry, title }: { entry: LogEntry; title?: string }) {
  if (!Object.hasOwn(ACTION_LABELS, entry.action)) return null;
  return (
    <Badge
      variant={entry.action === 'error' ? 'error' : 'fired'}
      data-testid="request-action"
      title={title}
    >
      {ACTION_LABELS[entry.action]}
    </Badge>
  );
}

function ruleFromEntry(entry: LogEntry) {
  const rule = createRule('response');
  const { path, pathname } = splitUrl(entry.url);
  const operation = graphqlOperation(entry.requestBody);
  rule.match.method = (METHODS as readonly string[]).includes(entry.method)
    ? (entry.method as HttpMethod)
    : 'ANY';
  rule.match.mode = 'equals';
  rule.match.url = operation ? pathname : path;
  rule.match.graphqlOperation = operation;
  rule.response.body = formatJson(entry.responseBody) ?? entry.responseBody;
  rule.response.status = entry.status && entry.status !== 200 ? String(entry.status) : '';
  if (entry.contentType)
    rule.response.contentType = entry.contentType.split(';')[0].trim();
  return rule;
}

function graphqlOperation(body: string) {
  try {
    const parsed = JSON.parse(body);
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    return (
      first?.operationName ||
      /^\s*(?:query|mutation|subscription)\s+(\w+)/.exec(first?.query || '')?.[1] ||
      ''
    );
  } catch {
    return '';
  }
}
