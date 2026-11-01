// One request in the list: its method and path, then the rule that fired (or else where the
// request went), its status and how long it took. Entries come from the page, so everything in
// them is shown as text, never as HTML.
import { memo } from 'react';
import type { LogEntry } from '../../../shared/api/index.ts';
import { splitUrl } from '../../../shared/lib/index.ts';
import { StatusCode } from '../../../shared/ui/kit/badge.tsx';
import { Item } from '../../../shared/ui/kit/item.tsx';
import { Method } from '../../../shared/ui/list-detail.tsx';
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
  return (
    <Item
      variant="request"
      data-testid="request"
      selected={selected}
      title={entry.url}
      onClick={() => onSelect(entry.id)}
    >
      <Method>{entry.method}</Method>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          data-testid="request-path"
          className="truncate font-mono text-body text-foreground"
        >
          {path}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-label whitespace-nowrap text-t40">
          {entry.action ? (
            <>
              <ActionBadge entry={entry} title={entry.error || entry.ruleName} />
              <span className="truncate text-t65">{entry.error || entry.ruleName}</span>
            </>
          ) : (
            `${host}${entry.frame ? ' · in iframe' : ''}`
          )}
        </span>
      </span>
      <StatusCode status={entry.status} failed={Boolean(entry.error)} />
      <span className="text-right font-mono text-meta text-t40 tabular-nums">
        {entry.duration != null ? `${entry.duration} ms` : ''}
      </span>
    </Item>
  );
});
