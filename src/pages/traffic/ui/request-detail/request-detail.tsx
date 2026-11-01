// One request, opened from the list, in a drawer that floats beside it (or takes the list's place
// in a narrow panel): its method and path with its status, duration and kind, then any error,
// Mock this response and the quieter actions, what's known about it, and its bodies.
// Memoized on the entry, which never changes: a long body is only formatted once.
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
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden wide:my-3 wide:mr-3 wide:w-[min(44%,600px)] wide:flex-none wide:rounded-xl wide:border wide:border-border wide:bg-card wide:shadow-menu"
    >
      <RequestHeader entry={entry} onClose={onClose} />
      <PaneScroll className="gap-4 px-4 pb-4 wide:px-5">
        {entry.error && <Alert variant="error">{entry.error}</Alert>}
        <RequestActions entry={entry} pretty={pretty} onMock={onMock} />
        <RequestFacts entry={entry} onOpenRule={onOpenRule} />
        <RequestBodies entry={entry} pretty={pretty} requestPretty={requestPretty} />
      </PaneScroll>
    </section>
  );
});
