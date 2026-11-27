// The top of a rule: whether it's answering requests, how often it has on the page the editor
// watches and how long ago it last did ("Mocking · fired 3× on Acme dashboard · 4m"), its name,
// which you edit in place, and one sentence that says what it does.
import type { RefObject } from 'react';
import { editRule, groupOf, isAnswering, pausedStore } from '../../index.ts';
import type { Rule } from '../../index.ts';
import { lastAnswered, recordingStore } from '../../../traffic/index.ts';
import type { TrafficLog, TrafficSnapshot } from '../../../traffic/index.ts';
import { useStore } from '../../../../ui/use-store.ts';
import { useTrafficValue } from '../../../traffic/ui/index.ts';
import { cn } from '../../../../ui/cn.ts';
import { Input } from '../../../../ui/kit/input.tsx';
import { RuleTime } from '../rule-time.tsx';
import { describeRule } from '../rule-summary.ts';

export function RuleIntro({
  rule,
  log,
  nameField,
}: {
  rule: Rule;
  log: TrafficLog;
  // The name's field, which the header's Rename puts the cursor in where it has no crumbs.
  nameField?: RefObject<HTMLInputElement | null>;
}) {
  const { match } = rule;
  return (
    <div className="flex flex-col items-start gap-1.5">
      <RuleState rule={rule} log={log} />
      <Input
        ref={nameField}
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
// the editor watches (while recording, which is how Ghostfetch knows) and, once it has, how long
// ago it last did, as its row in the list says it, from the same clock (rule-time.tsx); grey while
// it's off (its dot in the list, or in the popup, turns it on), or on while its group is off or
// Ghostfetch is. Only what the log has seen: it starts over with Clear and, unless Keep on reload
// is on, with a page load, so a count of none goes unsaid, and so does the time.
function RuleState({ rule, log }: { rule: Rule; log: TrafficLog }) {
  const { paused } = useStore(pausedStore);
  const { recording } = useStore(recordingStore);
  const hits = useTrafficValue(log, (traffic) => times(traffic, rule.id, false));
  const failures = useTrafficValue(log, (traffic) => times(traffic, rule.id, true));
  const last = useTrafficValue(log, (traffic) => lastAnswered(traffic.entries, rule.id));
  const page = useTrafficValue(log, (traffic) => traffic.target?.title ?? '');
  const group = groupOf(rule);
  const answering = isAnswering(rule, group?.enabled !== false, paused);
  let words = 'Off';
  let fired = '';
  if (rule.enabled && paused) words = 'Paused while Ghostfetch is off';
  else if (rule.enabled && group?.enabled === false)
    words = `Paused while ${group.name} is off`;
  else if (answering) {
    words = rule.response.bodyMode === 'replace' ? 'Mocking' : 'Modifying';
    fired = [hits && `fired ${hits}×`, failures && `failed ${failures}×`]
      .filter(Boolean)
      .join(', ');
    if (recording && fired) words += ` · ${fired} on ${page || 'this page'}`;
  }
  return (
    <span
      data-testid="rule-state"
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-label font-medium',
        answering ? 'bg-signal-soft text-signal' : 'bg-card text-t50',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 flex-none rounded-full',
          answering ? 'bg-signal' : 'bg-t30',
        )}
      />
      <span className="truncate">
        {words}
        {recording && fired !== '' && last > 0 && (
          <>
            {' '}
            <RuleTime last={last} quiet={false} testId="rule-state-time" />
          </>
        )}
      </span>
    </span>
  );
}
