// The top of a rule: whether it's answering requests and how often it has on the page the editor
// watches ("Mocking · fired 3× on Acme dashboard"), its name, which you edit in place, and one
// sentence that says what it does.
import { editRule, settingsStore } from '../../../../shared/api/index.ts';
import type { Rule, TrafficLog } from '../../../../shared/api/index.ts';
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
        className="-mx-2 h-auto w-[calc(100%+16px)] rounded-md px-2 py-0.5 text-[22px] leading-tight font-semibold tracking-tight text-white placeholder:text-t40 hover:bg-hover focus:bg-pressed focus:shadow-none @[760px]/pane:text-[26px]"
      />
      <p data-testid="rule-description" className="text-body leading-relaxed text-t50">
        {describeRule(rule)}
      </p>
    </div>
  );
}

// The chip over the name. Green while the rule answers requests, with how often it has on the page
// the editor watches (while recording, which is how Ghostfetch knows); grey while it's off, or on
// while Ghostfetch is off.
function RuleState({ rule, log }: { rule: Rule; log: TrafficLog }) {
  const { enabled, record } = useStore(settingsStore);
  const hits = useTrafficValue(
    log,
    (traffic) => traffic.entries.filter((entry) => entry.ruleId === rule.id).length,
  );
  const page = useTrafficValue(
    log,
    (traffic) => traffic.tabs.find((tab) => tab.id === traffic.targetId)?.title ?? '',
  );
  const live = rule.enabled && enabled;
  let words = 'Off';
  if (rule.enabled && !enabled) words = 'Paused while Ghostfetch is off';
  else if (live) {
    words = rule.response.bodyMode === 'replace' ? 'Mocking' : 'Modifying';
    if (record && hits) words += ` · fired ${hits}× on ${page || 'this page'}`;
    else if (record && page) words += ` · no matches on ${page} yet`;
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
