// The Delay row's editor: how long a rule holds the response back, in whole milliseconds up to 10
// minutes, typed or picked from a few common ones.
import { MAX_DELAY, editRule } from '../../../../shared/api/index.ts';
import type { Rule } from '../../../../shared/api/index.ts';
import { formatDuration } from '../../../../shared/lib/index.ts';
import { CardHint } from '../../../../shared/ui/kit/card.tsx';
import { Input } from '../../../../shared/ui/kit/input.tsx';
import { FieldLabel } from '../../../../shared/ui/kit/label.tsx';
import { ToggleGroup, ToggleGroupItem } from '../../../../shared/ui/kit/toggle-group.tsx';

const PRESETS = [0, 250, 500, 1000, 2000, 5000];

export function DelayPanel({ rule }: { rule: Rule }) {
  const { delay } = rule.response;
  // Whole milliseconds, from 0 to MAX_DELAY, as a rule is kept: the field shows what's kept.
  const setDelay = (ms: number) =>
    editRule(rule.id, (current) => {
      current.response.delay = Math.min(MAX_DELAY, Math.max(0, Math.round(ms || 0)));
    });
  return (
    <>
      <label className="flex min-w-0 flex-col gap-[5px]">
        <FieldLabel>Delay</FieldLabel>
        <span className="flex items-center gap-2.5">
          <Input
            type="number"
            min={0}
            max={MAX_DELAY}
            step={250}
            data-testid="delay"
            value={delay || ''}
            placeholder="0"
            onChange={(event) => setDelay(Number(event.target.value))}
            className="w-[120px] bg-background font-mono tabular-nums"
          />
          <span className="text-body text-t40">ms</span>
        </span>
      </label>
      {/* Clicking the chosen one again goes back to none. */}
      <ToggleGroup
        aria-label="Common delays"
        value={[String(delay)]}
        onValueChange={(values) => setDelay(Number((values as string[])[0] ?? 0))}
        className="grid grid-cols-3 bg-background"
      >
        {PRESETS.map((ms) => (
          <ToggleGroupItem key={ms} value={String(ms)} data-testid={`delay-${ms}`}>
            {ms ? formatDuration(ms) : 'None'}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <CardHint>
        The page waits this long for the response, so you can see its loading states and
        timeouts. Up to 10 minutes.
      </CardHint>
    </>
  );
}
