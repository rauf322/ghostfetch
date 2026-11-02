// What's known about an open request, a row each in one card: its URL, when it was sent, its
// Content-Type, and the rule that acted on it (with a link to open it) or that none did.
import type { ReactNode } from 'react';
import type { LogEntry } from '../../../../shared/api/index.ts';
import { cn } from '../../../../shared/ui/cn.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { CARD } from '../../../../shared/ui/kit/card.tsx';
import { ActionBadge } from '../action-badge.tsx';

export function RequestFacts({
  entry,
  onOpenRule,
}: {
  entry: LogEntry;
  onOpenRule: (id: string) => void;
}) {
  return (
    <dl className={cn(CARD, 'flex flex-col px-3.5 wide:bg-background')}>
      <Fact label="URL" className="font-mono text-meta break-all">
        {entry.url}
      </Fact>
      <Fact label="Sent">{new Date(entry.time).toLocaleTimeString()}</Fact>
      {entry.contentType && (
        <Fact label="Content-Type" className="font-mono text-meta">
          {entry.contentType}
        </Fact>
      )}
      <Fact label="Rule">
        {entry.ruleId ? (
          <>
            <ActionBadge entry={entry} />
            <span className="min-w-0 truncate">{entry.ruleName}</span>
            <Button
              variant="link"
              size="inline"
              data-testid="open-rule"
              onClick={() => onOpenRule(entry.ruleId!)}
              className="text-t65"
            >
              Open
            </Button>
          </>
        ) : (
          <span className="text-t65">None: it went to the server</span>
        )}
      </Fact>
    </dl>
  );
}

// One fact: its name on the left, its value on the right, a hairline between rows.
function Fact({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-4 border-b border-border py-3 last:border-b-0">
      <dt className="flex-none text-body text-t50">{label}</dt>
      <dd
        className={cn(
          'flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 text-right text-body text-foreground',
          className,
        )}
      >
        {children}
      </dd>
    </div>
  );
}
