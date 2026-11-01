// What's known about an open request, each a small label over its value: its URL, what made it
// (and in which iframe), how long it took, when, its Content-Type, and the rule that fired.
import type { ReactNode } from 'react';
import type { LogEntry } from '../../../../shared/api/index.ts';
import { cn } from '../../../../shared/ui/cn.ts';
import { ActionBadge } from '../action-badge.tsx';

const KIND_LABELS: Record<LogEntry['kind'], string> = {
  fetch: 'fetch()',
  xhr: 'XMLHttpRequest',
};

export function RequestFacts({ entry }: { entry: LogEntry }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 px-3.5 pt-1 pb-3">
      <Fact label="URL" wide className="font-mono text-meta break-all">
        {entry.url}
      </Fact>
      <Fact
        label="Type"
        className="font-mono text-meta"
      >{`${KIND_LABELS[entry.kind]}${entry.frame ? ` in iframe ${entry.frame}` : ''}`}</Fact>
      {entry.duration != null && <Fact label="Duration">{`${entry.duration} ms`}</Fact>}
      <Fact label="Time">{new Date(entry.time).toLocaleTimeString()}</Fact>
      {entry.contentType && (
        <Fact label="Content-Type" className="font-mono text-meta">
          {entry.contentType}
        </Fact>
      )}
      {entry.ruleId && (
        <Fact label="Rule" wide>
          <ActionBadge entry={entry} />
          {entry.ruleName}
        </Fact>
      )}
    </dl>
  );
}

// One fact: a small label over its value, across both columns if it's `wide`.
function Fact({
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
      <dt className="mb-0.5 text-label text-t40">{label}</dt>
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
