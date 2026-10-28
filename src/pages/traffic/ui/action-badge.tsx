// What a rule did to a request: the green square and a word, or an inverted "Rule error".
import type { LogEntry } from '../../../shared/api/index.ts';
import { Badge } from '../../../shared/ui/kit/badge.tsx';

const ACTION_LABELS: Record<string, string> = {
  mocked: 'Mocked',
  modified: 'Modified',
  error: 'Rule error',
  redirect: 'Redirected',
  headers: 'Headers',
  block: 'Blocked',
};

export function ActionBadge({ entry, title }: { entry: LogEntry; title?: string }) {
  if (!Object.hasOwn(ACTION_LABELS, entry.action)) return null;
  return (
    <Badge
      variant={entry.action === 'error' ? 'error' : 'fired'}
      data-testid="request-action"
      title={title}
    >
      {ACTION_LABELS[entry.action]}
    </Badge>
  );
}
