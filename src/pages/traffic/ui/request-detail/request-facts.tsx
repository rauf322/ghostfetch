// What's known about an open request, each a small label over its value: its URL, what made it
// (and in which iframe), how long it took, when, its Content-Type, and the rule that fired.
import type { ReactNode } from 'react';
import type { LogEntry } from '../../../../entities/traffic/index.ts';
import { cn } from '../../../../shared/lib/class-names/index.ts';
import { ActionBadge } from '../action-badge.tsx';

const KIND_LABELS: Record<string, string> = {
  fetch: 'fetch()',
  xhr: 'XMLHttpRequest',
  xmlhttprequest: 'XHR / fetch',
  main_frame: 'Page',
  sub_frame: 'Iframe',
};

export function RequestFacts({ entry }: { entry: LogEntry }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 px-3.5 pt-1 pb-3">
      <Fact label="URL" wide className="break-all">
        {entry.url}
      </Fact>
      <Fact label="Type">{`${KIND_LABELS[entry.kind] || entry.kind}${entry.frame ? ` in iframe ${entry.frame}` : ''}`}</Fact>
      {entry.duration != null && <Fact label="Duration">{`${entry.duration} ms`}</Fact>}
      <Fact label="Time">{new Date(entry.time).toLocaleTimeString()}</Fact>
      {entry.contentType && <Fact label="Content-Type">{entry.contentType}</Fact>}
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
