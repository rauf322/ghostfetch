// The bar across the top of an open request: back to the list (in a narrow panel), its method,
// its path (the full URL as its title) and its status.
import type { LogEntry } from '../../../../shared/api/index.ts';
import { splitUrl } from '../../../../shared/lib/index.ts';
import { StatusCode } from '../../../../shared/ui/kit/badge.tsx';
import { BackButton, Method, PaneHead } from '../../../../shared/ui/list-detail.tsx';

export function RequestHeader({
  entry,
  onBack,
}: {
  entry: LogEntry;
  onBack: () => void;
}) {
  const { path } = splitUrl(entry.url);
  return (
    <PaneHead>
      <BackButton title="All requests" data-testid="request-back" onClick={onBack} />
      <Method className="self-center pl-3.5">{entry.method}</Method>
      <span
        title={entry.url}
        className="min-w-0 flex-1 self-center truncate px-2.5 text-title font-medium text-white"
      >
        {path}
      </span>
      <StatusCode
        status={entry.status}
        failed={Boolean(entry.error)}
        className="mx-3.5 self-center"
      />
    </PaneHead>
  );
}
