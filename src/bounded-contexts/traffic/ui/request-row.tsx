// One request in the list: its method (green when a rule answered it), its path (cut in its middle
// where it's long, so its query's end stays; the row's title holds the whole URL), then what the rule
// did and which rule, with its group if it was in one ("Mocked by Feature flags · PR-1"), or why it
// failed and the rule it was under ("Aborted · Feature flags"), or else where the request went and
// what made it, and how long ago the page sent it ("· 4m"). At its right end its slot (the kit's
// ItemSlot): its status over how long it took, and in their place, under the pointer, with focus,
// while its right-click menu is open, and for the second one says it copied, its actions: Mock this
// response, Copy URL and Copy as cURL (entry-actions.ts). Entries come from the page, so everything
// in them is shown as text, never as HTML.
//
// In the list (traffic-list.tsx) the row's method, path and what happened are one button, which
// opens the request (as a click anywhere on the row but its actions does), named by its words and
// described by its status and duration; its actions are buttons beside it, Tab stops only while
// the row is the list's Tab stop.
import { memo, useEffect, useId, useRef, useState } from 'react';
import type { LogEntry } from '../index.ts';
import { formatDuration, splitUrl, timeAgo } from '../../../lib/index.ts';
import { cn } from '../../../ui/cn.ts';
import { StatusCode } from '../../../ui/kit/badge.tsx';
import { useCopied } from '../../../ui/kit/copy-button.tsx';
import { Icon } from '../../../ui/kit/icon.tsx';
import { Item, ItemAction, ItemSlot } from '../../../ui/kit/item.tsx';
import { MiddleTruncate } from '../../../ui/kit/middle-truncate.tsx';
import { TooltipTrigger } from '../../../ui/kit/tooltip.tsx';
import { Method } from '../../../ui/list-detail.tsx';
import { useNowValue } from '../../../ui/use-now.ts';
import { KIND_LABELS } from './entry-labels.ts';
import { ActionBadge } from './action-badge.tsx';
import { MOCK, ROW_COPIES } from './entry-actions.ts';
import type { CopyAction } from './entry-actions.ts';
import { useRowTools } from './row-tools.ts';

// The ring a row shows while its button has keyboard focus, as the editor's rows show theirs.
const OPEN_FOCUS =
  'has-[[data-row-open]:focus-visible]:ring-[1.5px] has-[[data-row-open]:focus-visible]:ring-t65 has-[[data-row-open]:focus-visible]:ring-inset';

export const RequestRow = memo(function RequestRow({
  entry,
  selected,
  tabbable,
  onSelect,
}: {
  entry: LogEntry;
  selected: boolean;
  // The list's Tab stop: the one row the keyboard enters the list at, whose actions are Tab stops.
  tabbable: boolean;
  onSelect: (id: string) => void;
}) {
  // Its actions are the shared tooltips' triggers once the pointer or focus has come near the row,
  // or the row is the list's Tab stop: plain buttons until then, so a long log mounts quickly.
  // Told once: a state set again to what it is can still draw the row.
  const [near, setNear] = useState(false);
  const told = useRef(false);
  const approach = () => {
    if (told.current) return;
    told.current = true;
    setNear(true);
  };
  const ids = useId();
  const { host, path } = splitUrl(entry.url);
  const answered = entry.action === 'mocked' || entry.action === 'modified';
  const rule = [entry.ruleName, entry.groupName].filter(Boolean).join(' · ');
  return (
    <Item
      variant="request"
      data-testid="request"
      data-entry={entry.id}
      selected={selected}
      title={entry.url}
      // A click anywhere on the row opens it, as its button does, but one on its actions.
      onClick={(event) => {
        if (!(event.target as Element).closest('[data-slot="item-slot-actions"]'))
          onSelect(entry.id);
      }}
      onPointerEnter={approach}
      onFocus={approach}
      className={cn('mx-0', OPEN_FOCUS)}
    >
      <button
        type="button"
        data-row-open=""
        data-testid="request-open"
        tabIndex={tabbable ? 0 : -1}
        aria-current={selected || undefined}
        aria-describedby={`${ids}status`}
        className="col-span-2 grid cursor-pointer grid-cols-subgrid items-center text-left focus-visible:outline-none"
      >
        <Method matched={answered}>{entry.method}</Method>
        <span className="flex min-w-0 flex-col gap-0.5">
          <MiddleTruncate
            data-testid="request-path"
            text={path}
            className="font-mono text-body text-foreground"
          />
          <span className="flex min-w-0 items-center gap-1 overflow-hidden text-label whitespace-nowrap text-t40">
            {entry.action ? (
              <>
                <ActionBadge entry={entry} title={entry.error || rule} />
                {answered && <span className="flex-none text-signal">by</span>}
                <span className="truncate pl-0.5 text-t65">{entry.error || rule}</span>
              </>
            ) : (
              <span className="truncate">
                {(entry.error
                  ? [entry.error, entry.ruleName || host]
                  : [host, KIND_LABELS[entry.kind], entry.frame && 'in an iframe']
                )
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
            <RequestTime time={entry.time} />
          </span>
        </span>
      </button>
      <ItemSlot
        stacked
        statusId={`${ids}status`}
        // Room for its three actions.
        className="min-w-19"
        actions={
          <RowActions
            entry={entry}
            live={near || tabbable}
            tabbable={tabbable}
            onNear={approach}
          />
        }
      >
        <StatusCode status={entry.status} failed={Boolean(entry.error)} />
        <span className="font-mono text-label text-t40 tabular-nums">
          {entry.duration != null ? formatDuration(entry.duration) : ''}
        </span>
      </ItemSlot>
    </Item>
  );
});

// How long ago the page sent the request ("· 4m", "· 2h"), from the screens' clock: it draws again
// by itself only when those words change, at most once a minute, and nothing else of the row does.
// Nothing for its first minute, when the row sits under "Just now", which says that already: the
// clock moves in steps of 15 s, so a count of seconds would be up to 15 s behind.
function RequestTime({ time }: { time: number }) {
  const ago = useNowValue((now) => timeAgo(now - time));
  if (ago === 'now') return null;
  return (
    <span data-testid="request-time" className="flex-none">
      {`· ${ago}`}
    </span>
  );
}

// The slot's actions: Mock this response, Copy URL and Copy as cURL. Plain buttons until the row is
// `live`: Mock works as one; a copy pressed then (by a screen reader, which moves no pointer) makes
// the row live, and the copy runs once its button is there, to say it copied.
function RowActions({
  entry,
  live,
  tabbable,
  onNear,
}: {
  entry: LogEntry;
  live: boolean;
  tabbable: boolean;
  onNear: () => void;
}) {
  const tools = useRowTools();
  // A copy pressed while the buttons were plain, which its live button runs (take()).
  const pending = useRef<CopyAction | null>(null);
  const take = (action: CopyAction) => {
    if (pending.current !== action) return false;
    pending.current = null;
    return true;
  };
  const about = `${entry.method} ${splitUrl(entry.url).path}`;
  const tabIndex = tabbable ? 0 : -1;
  const mock = (
    <ItemAction
      data-testid={`row-${MOCK.id}`}
      data-action={MOCK.id}
      aria-label={`${MOCK.label}: ${about}`}
      tabIndex={tabIndex}
      onClick={() => tools.mock(entry)}
    >
      <Icon name={MOCK.icon} size={14} />
    </ItemAction>
  );
  if (!live)
    return (
      <>
        {mock}
        {ROW_COPIES.map((action) => (
          <ItemAction
            key={action.id}
            data-testid={`row-${action.id}`}
            data-action={action.id}
            aria-label={`${action.label}: ${about}`}
            tabIndex={tabIndex}
            onClick={() => {
              pending.current = action;
              onNear();
            }}
          >
            <Icon name={action.icon} size={14} />
          </ItemAction>
        ))}
      </>
    );
  return (
    <>
      <TooltipTrigger handle={tools.tips.get(MOCK)!} label={MOCK.label}>
        {mock}
      </TooltipTrigger>
      {ROW_COPIES.map((action) => (
        <CopyAction
          key={action.id}
          action={action}
          entry={entry}
          about={about}
          tabIndex={tabIndex}
          take={take}
        />
      ))}
    </>
  );
}

// A copy in the slot: its icon is a check in the signal's colour for the second after it copied,
// and a polite live region says what it copied (2c's useCopied()).
function CopyAction({
  action,
  entry,
  about,
  tabIndex,
  take,
}: {
  action: CopyAction;
  entry: LogEntry;
  about: string;
  tabIndex: number;
  // Whether this copy was pressed before the row was live, so it runs now.
  take: (action: CopyAction) => boolean;
}) {
  const tools = useRowTools();
  const { copied, copy, live } = useCopied(action.what);
  useEffect(() => {
    if (take(action)) copy(action.text(entry));
  }, [action, copy, entry, take]);
  return (
    <>
      <TooltipTrigger handle={tools.tips.get(action)!} label={action.label}>
        <ItemAction
          data-testid={`row-${action.id}`}
          data-action={action.id}
          data-copied={copied || undefined}
          aria-label={`${action.label}: ${about}`}
          tabIndex={tabIndex}
          onClick={() => copy(action.text(entry))}
        >
          <Icon
            name={copied ? 'check' : action.icon}
            size={14}
            className={cn(copied && 'text-signal')}
          />
        </ItemAction>
      </TooltipTrigger>
      {live}
    </>
  );
}
