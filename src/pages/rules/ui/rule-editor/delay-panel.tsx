// The Delay tab: how long a response rule holds the response back, in whole milliseconds, typed or
// picked from a few common ones.
import { editRule } from '../../../../shared/api/index.ts';
import type { Rule } from '../../../../shared/api/index.ts';
import { CardHint } from '../../../../shared/ui/kit/card.tsx';
import { Input } from '../../../../shared/ui/kit/input.tsx';
import { FieldLabel } from '../../../../shared/ui/kit/label.tsx';
import { ToggleGroup, ToggleGroupItem } from '../../../../shared/ui/kit/toggle-group.tsx';
import { formatDelay } from '../../lib/rule-summary.ts';

const PRESETS = [0, 250, 500, 1000, 2000, 5000];

export function DelayPanel({ rule }: { rule: Rule }) {
  const { delay } = rule.response;
  // Whole milliseconds, never below 0: the field shows what's kept.
  const setDelay = (ms: number) =>
    editRule(rule.id, (current) => {
      current.response.delay = Math.max(0, Math.round(ms || 0));
    });
  return (
    <>
      <label className="flex min-w-0 flex-col gap-[5px]">
        <FieldLabel>Delay</FieldLabel>
        <span className="flex items-center gap-2.5">
          <Input
            type="number"
            min={0}
            step={250}
            data-testid="delay"
            value={delay || ''}
            placeholder="0"
            onChange={(event) => setDelay(Number(event.target.value))}
            className="w-[120px] tabular-nums"
          />
          <span className="text-body text-t40">ms</span>
        </span>
      </label>
      {/* Clicking the chosen one again goes back to none. */}
      <ToggleGroup
        aria-label="Common delays"
        value={[String(delay)]}
        onValueChange={(values) => setDelay(Number((values as string[])[0] ?? 0))}
      >
        {PRESETS.map((ms) => (
          <ToggleGroupItem key={ms} value={String(ms)} data-testid={`delay-${ms}`}>
            {ms ? formatDelay(ms) : 'None'}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <CardHint>
        The page waits this long for the response, so you can see its loading states and
        timeouts.
      </CardHint>
    </>
  );
}
