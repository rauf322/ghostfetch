// One request in the list: its method (green when a rule answered it), its path, then what the rule
// did and which rule ("Mocked by Feature flags"), or why it failed and the rule it was under
// ("Aborted · Feature flags"), or else where the request went and what made it; on the right its
// status over how long it took. Entries come from the page, so everything in them is shown as
// text, never as HTML.
import { memo } from 'react';
import type { LogEntry } from '../../../shared/api/index.ts';
import { formatDuration, splitUrl } from '../../../shared/lib/index.ts';
import { StatusCode } from '../../../shared/ui/kit/badge.tsx';
import { Item } from '../../../shared/ui/kit/item.tsx';
import { Method } from '../../../shared/ui/list-detail.tsx';
import { KIND_LABELS } from '../lib/entry-labels.ts';
import { ActionBadge } from './action-badge.tsx';

export const RequestRow = memo(function RequestRow({
  entry,
  selected,
  onSelect,
}: {
  entry: LogEntry;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { host, path } = splitUrl(entry.url);
  const answered = entry.action === 'mocked' || entry.action === 'modified';
  return (
    <Item
      variant="request"
      data-testid="request"
      selected={selected}
      title={entry.url}
      onClick={() => onSelect(entry.id)}
      className="mx-0"
    >
      <Method matched={answered}>{entry.method}</Method>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          data-testid="request-path"
          className="truncate font-mono text-body text-foreground"
        >
          {path}
        </span>
        <span className="flex min-w-0 items-center gap-1 overflow-hidden text-label whitespace-nowrap text-t40">
          {entry.action ? (
            <>
              <ActionBadge entry={entry} title={entry.error || entry.ruleName} />
              {answered && <span className="flex-none text-signal">by</span>}
              <span className="truncate pl-0.5 text-t65">
                {entry.error || entry.ruleName}
              </span>
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
        </span>
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <StatusCode status={entry.status} failed={Boolean(entry.error)} />
        <span className="font-mono text-label text-t40 tabular-nums">
          {entry.duration != null ? formatDuration(entry.duration) : ''}
        </span>
      </span>
    </Item>
  );
});
