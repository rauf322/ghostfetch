// The Status row's editor: the status code a rule sends (typed, with its name beside it, or picked
// from the common ones, grouped by class), and what an empty one means for the body mode.
import { editRule } from '../../../../shared/api/index.ts';
import type { Rule } from '../../../../shared/api/index.ts';
import { CardHint } from '../../../../shared/ui/kit/card.tsx';
import { Input } from '../../../../shared/ui/kit/input.tsx';
import { FieldLabel } from '../../../../shared/ui/kit/label.tsx';
import { ToggleGroup, ToggleGroupItem } from '../../../../shared/ui/kit/toggle-group.tsx';
import { statusName } from '../../../../shared/lib/index.ts';
import { STATUS_GROUPS, presetName } from '../../lib/status-codes.ts';

export function StatusPanel({ rule }: { rule: Rule }) {
  const { response } = rule;
  const replaces = response.bodyMode === 'replace';
  const setStatus = (status: string) =>
    editRule(rule.id, (current) => {
      current.response.status = status;
    });
  return (
    <>
      <label className="flex min-w-0 flex-col gap-[5px]">
        <FieldLabel>Status code</FieldLabel>
        <span className="flex items-center gap-3">
          <Input
            type="number"
            min={200}
            max={599}
            data-testid="status-code"
            value={response.status}
            placeholder={replaces ? '200' : 'Keep'}
            onChange={(event) => setStatus(event.target.value)}
            className="w-[88px] bg-background font-mono tabular-nums"
          />
          <span data-testid="status-name" className="truncate text-body text-t65">
            {statusName(response.status)}
          </span>
        </span>
      </label>
      <CardHint>
        {replaces
          ? 'Sent with your body. Leave it empty to send 200 OK.'
          : "Replaces the server's status. Leave it empty to keep it."}
      </CardHint>
      {STATUS_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1.5">
          <FieldLabel>{group.label}</FieldLabel>
          {/* Click the chosen code again to clear it. */}
          <ToggleGroup
            aria-label={group.label}
            value={[response.status]}
            onValueChange={(values) => setStatus((values as string[])[0] ?? '')}
            className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-1 bg-transparent p-0"
          >
            {group.codes.map((code) => (
              <ToggleGroupItem
                key={code}
                value={String(code)}
                data-testid={`status-${code}`}
                title={`${code} ${statusName(code)}`}
                className="group/code flex h-8 items-center justify-start gap-2 bg-background px-2.5"
              >
                <span className="font-mono text-meta text-foreground tabular-nums">
                  {code}
                </span>
                <span className="truncate text-label text-t40 group-data-pressed/code:text-t65">
                  {presetName(code)}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ))}
    </>
  );
}
