// One request, opened from the list: its method, path and status along the top, then any error,
// what to do with it (Mock this response first), what's known about it, and its bodies.
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
  onBack,
  onMock,
  onOpenRule,
}: {
  entry: LogEntry;
  onBack: () => void;
  onMock: (draft: Rule) => void;
  onOpenRule: (id: string) => void;
}) {
  const pretty = useMemo(() => formatJson(entry.responseBody), [entry.responseBody]);
  const requestPretty = useMemo(() => formatJson(entry.requestBody), [entry.requestBody]);

  return (
    <>
      <RequestHeader entry={entry} onBack={onBack} />
      <PaneScroll>
        {entry.error && (
          <Alert variant="error" className="mx-3.5 mt-3.5">
            {entry.error}
          </Alert>
        )}
        <RequestActions
          entry={entry}
          pretty={pretty}
          onMock={onMock}
          onOpenRule={onOpenRule}
        />
        <RequestFacts entry={entry} />
        <RequestBodies entry={entry} pretty={pretty} requestPretty={requestPretty} />
      </PaneScroll>
    </>
  );
});
