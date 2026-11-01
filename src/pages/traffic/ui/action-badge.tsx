// What a rule did to a request: the green dot and a word, or an inverted "Rule error".
import type { EntryAction, LogEntry } from '../../../shared/api/index.ts';
import { Badge } from '../../../shared/ui/kit/badge.tsx';

// Every action, so a new one can't go without its words. The bridge lets no other value into the
// log (clean() in app/bridge).
const ACTION_LABELS: Record<Exclude<EntryAction, ''>, string> = {
  mocked: 'Mocked',
  modified: 'Modified',
  error: 'Rule error',
};

export function ActionBadge({ entry, title }: { entry: LogEntry; title?: string }) {
  if (!entry.action) return null;
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
