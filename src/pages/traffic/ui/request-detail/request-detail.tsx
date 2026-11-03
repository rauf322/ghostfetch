// One request, opened from the list, in a drawer that floats beside it (or takes the list's place
// where there's no room for both): its method and path with its status, duration and kind, then
// any error, Mock this response and the quieter actions, what's known about it, and its bodies.
// Beside the list it's 44% of the view, between 360 and 600 px. Memoized on the entry, which
// never changes: a long body is only formatted once.
import { memo, useMemo } from 'react';
import type { LogEntry, Rule } from '../../../../shared/api/index.ts';
import { formatJson } from '../../../../shared/lib/index.ts';
import { Alert } from '../../../../shared/ui/kit/alert.tsx';
import { PaneScroll } from '../../../../shared/ui/list-detail.tsx';
import { RequestActions } from './request-actions.tsx';
import { RequestBodies } from './request-bodies.tsx';
import { RequestFacts } from './request-facts.tsx';
import { RequestHeader } from './request-header.tsx';

export const RequestDetail = memo(function RequestDetail({
  entry,
  onClose,
  onMock,
  onOpenRule,
}: {
  entry: LogEntry;
  onClose: () => void;
  onMock: (draft: Rule) => void;
  onOpenRule: (id: string) => void;
}) {
  const pretty = useMemo(() => formatJson(entry.responseBody), [entry.responseBody]);
  const requestPretty = useMemo(() => formatJson(entry.requestBody), [entry.requestBody]);

  return (
    <section
      aria-label="Request"
      data-testid="request-detail"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden beside:mt-1 beside:mr-3 beside:mb-3 beside:w-[clamp(360px,44%,600px)] beside:flex-none beside:rounded-xl beside:border beside:border-border beside:bg-card beside:shadow-menu"
    >
      <RequestHeader entry={entry} onClose={onClose} />
      <PaneScroll className="gap-4 px-4 pb-4 beside:px-5">
        {entry.error && <Alert variant="error">{entry.error}</Alert>}
        <RequestActions entry={entry} pretty={pretty} onMock={onMock} />
        <RequestFacts entry={entry} onOpenRule={onOpenRule} />
        <RequestBodies entry={entry} pretty={pretty} requestPretty={requestPretty} />
      </PaneScroll>
    </section>
  );
});
