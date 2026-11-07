// "Or mock something Acme dashboard just asked for": the page's latest requests that no rule
// answered, each with Mock, which makes a rule of it as Traffic's Mock this response does, and
// a link to Traffic for the rest. Nothing shows until the page has asked for something.
import { ruleFromEntry } from '../../../../shared/api/index.ts';
import type { LogEntry, Rule, TrafficLog } from '../../../../shared/api/index.ts';
import { formatDuration, splitUrl } from '../../../../shared/lib/index.ts';
import { useTraffic } from '../../../../shared/react/index.ts';
import { StatusCode } from '../../../../shared/ui/kit/badge.tsx';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { ItemList } from '../../../../shared/ui/kit/item.tsx';
import { Method, PaneSection } from '../../../../shared/ui/list-detail.tsx';
import { recentRequests } from '../../lib/recent-requests.ts';

export function RecentRequests({
  log,
  onMock,
  onOpenTraffic,
}: {
  log: TrafficLog;
  onMock: (rule: Rule, entry: LogEntry) => void;
  onOpenTraffic: () => void;
}) {
  const traffic = useTraffic(log);
  const recent = recentRequests(traffic.entries);
  if (!recent.length) return null;
  const page = traffic.target?.title;
  return (
    <PaneSection
      label={`Or mock something ${page || 'the page'} just asked for`}
      aside={
        <Button
          variant="link"
          size="inline"
          onClick={onOpenTraffic}
          className="flex-none text-label text-t65"
        >
          Open Traffic
        </Button>
      }
    >
      <ItemList>
        {recent.map((entry) => (
          <li
            key={entry.id}
            data-testid="recent-request"
            title={entry.url}
            className="flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-hover"
          >
            <Method>{entry.method}</Method>
            <span className="min-w-0 flex-1 truncate font-mono text-body text-foreground">
              {splitUrl(entry.url).path}
            </span>
            <span className="hidden flex-none items-center gap-1.5 font-mono text-label text-t40 @[520px]/composer:flex">
              <StatusCode status={entry.status} failed={Boolean(entry.error)} />
              {entry.duration != null && `· ${formatDuration(entry.duration)}`}
            </span>
            <Button
              data-testid="recent-mock"
              onClick={() => onMock(ruleFromEntry(entry), entry)}
              className="flex-none"
            >
              <Icon name="wand" size={14} />
              Mock
            </Button>
          </li>
        ))}
      </ItemList>
    </PaneSection>
  );
}
