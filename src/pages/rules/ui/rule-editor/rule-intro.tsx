// The top of a rule: whether it's answering requests and how often it has on the page the editor
// watches ("Mocking · fired 3× on Acme dashboard"), its name, which you edit in place, and one
// sentence that says what it does.
import { editRule, settingsStore } from '../../../../shared/api/index.ts';
import type { Rule, TrafficLog, TrafficSnapshot } from '../../../../shared/api/index.ts';
import { useStore, useTrafficValue } from '../../../../shared/react/index.ts';
import { cn } from '../../../../shared/ui/cn.ts';
import { Input } from '../../../../shared/ui/kit/input.tsx';
import { describeRule } from '../../lib/rule-summary.ts';

export function RuleIntro({ rule, log }: { rule: Rule; log: TrafficLog }) {
  const { match } = rule;
  return (
    <div className="flex flex-col items-start gap-1.5">
      <RuleState rule={rule} log={log} />
      <Input
        variant="bare"
        data-testid="rule-name"
        aria-label="Rule name"
        value={rule.name}
        placeholder={match.graphqlOperation || match.url || 'Name this rule'}
        onChange={(event) =>
          editRule(rule.id, (current) => {
            current.name = event.target.value;
          })
        }
        className="-mx-2 h-auto w-[calc(100%+16px)] rounded-md px-2 py-0.5 text-[22px] leading-tight font-semibold tracking-tight text-strong placeholder:text-t40 hover:bg-hover focus:bg-pressed focus:shadow-none pane-wide:text-[26px]"
      />
      <p data-testid="rule-description" className="text-body leading-relaxed text-t50">
        {describeRule(rule)}
      </p>
    </div>
  );
}

// How often the rule answered on the page the editor watches (`failed`: how often it went wrong
// there instead). A request the page gave up on before the rule answered (aborted, or timed out)
// is neither.
const times = (traffic: TrafficSnapshot, id: string, failed: boolean) =>
  traffic.entries.filter(
    (entry) =>
      entry.ruleId === id &&
      (failed
        ? entry.action === 'error'
        : entry.action === 'mocked' || entry.action === 'modified'),
  ).length;

// The chip over the name. Green while the rule answers requests, with how often it has on the page
// the editor watches (while recording, which is how Ghostfetch knows); grey while it's off, or on
// while Ghostfetch is off. Only what the log has seen: it starts over with Clear and, unless Keep
// on reload is on, with a page load, so a count of none goes unsaid.
function RuleState({ rule, log }: { rule: Rule; log: TrafficLog }) {
  const { enabled, record } = useStore(settingsStore);
  const hits = useTrafficValue(log, (traffic) => times(traffic, rule.id, false));
  const failures = useTrafficValue(log, (traffic) => times(traffic, rule.id, true));
  const page = useTrafficValue(log, (traffic) => traffic.target?.title ?? '');
  const live = rule.enabled && enabled;
  let words = 'Off';
  if (rule.enabled && !enabled) words = 'Paused while Ghostfetch is off';
  else if (live) {
    words = rule.response.bodyMode === 'replace' ? 'Mocking' : 'Modifying';
    const fired = [hits && `fired ${hits}×`, failures && `failed ${failures}×`]
      .filter(Boolean)
      .join(', ');
    if (record && fired) words += ` · ${fired} on ${page || 'this page'}`;
  }
  return (
    <span
      data-testid="rule-state"
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-label font-medium',
        live ? 'bg-signal-soft text-signal' : 'bg-card text-t50',
      )}
    >
      <span
        aria-hidden
        className={cn('size-1.5 flex-none rounded-full', live ? 'bg-signal' : 'bg-t30')}
      />
      <span className="truncate">{words}</span>
    </span>
  );
}
