// "Or mock something Acme dashboard just asked for": the page's latest requests that no rule
// answered, each with Mock, which makes a rule of it as Traffic's Mock this response does, and
// a link to Traffic for the rest. Nothing shows until the page has asked for something.
import { ruleFromEntry } from '../../../../shared/api/index.ts';
import type { Rule, TrafficLog } from '../../../../shared/api/index.ts';
import { splitUrl } from '../../../../shared/lib/index.ts';
import { useTraffic } from '../../../../shared/react/index.ts';
import { StatusCode } from '../../../../shared/ui/kit/badge.tsx';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { Method } from '../../../../shared/ui/list-detail.tsx';
import { recentRequests } from '../../lib/recent-requests.ts';

export function RecentRequests({
  log,
  onMock,
  onOpenTraffic,
}: {
  log: TrafficLog;
  onMock: (draft: Rule) => void;
  onOpenTraffic: () => void;
}) {
  const traffic = useTraffic(log);
  const recent = recentRequests(traffic.entries);
  if (!recent.length) return null;
  const page = traffic.tabs.find((tab) => tab.id === traffic.targetId)?.title;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="min-w-0 truncate text-label font-medium text-t40">
          Or mock something {page || 'the page'} just asked for
        </h2>
        <Button
          variant="link"
          size="inline"
          onClick={onOpenTraffic}
          className="flex-none text-label text-t65"
        >
          Open Traffic
        </Button>
      </div>
      <ul className="rounded-lg bg-card p-1">
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
              {entry.duration != null && `· ${entry.duration} ms`}
            </span>
            <Button
              size="sm"
              data-testid="recent-mock"
              onClick={() => onMock(ruleFromEntry(entry))}
              className="h-8 flex-none"
            >
              <Icon name="wand" size={14} />
              Mock
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
