// One request in the list: its method and path, then the rule that fired (or else where the
// request went), its status and how long it took. Entries come from the page, so everything in
// them is shown as text, never as HTML.
import { memo } from 'react';
import type { LogEntry } from '../../../entities/traffic/index.ts';
import { splitUrl } from '../../../shared/lib/url/index.ts';
import { StatusCode } from '../../../shared/ui/kit/badge.tsx';
import { Item } from '../../../shared/ui/kit/item.tsx';
import { Method } from '../../../shared/ui/list-detail/index.ts';
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
