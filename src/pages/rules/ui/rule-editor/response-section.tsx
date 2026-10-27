// "Status, delay and headers" for a response rule: the status code (typed or picked from the
// common ones), the delay, the Content-Type for a body it replaces, and headers to set or remove.
import type { Rule } from '../../../../entities/rule/index.ts';
import { Card, CardTitle } from '../../../../shared/ui/kit/card.tsx';
import { Input } from '../../../../shared/ui/kit/input.tsx';
import { FieldLabel } from '../../../../shared/ui/kit/label.tsx';
import { ToggleGroup, ToggleGroupItem } from '../../../../shared/ui/kit/toggle-group.tsx';
import { editRule } from '../../model/edit-rule.ts';
import { HeaderRows } from './header-rows.tsx';

const STATUS_PRESETS = [200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500, 503];

export function ResponseSection({ rule, index }: { rule: Rule; index: number }) {
  const { response } = rule;
  return (
    <Card>
      <CardTitle index={index}>Status, delay and headers</CardTitle>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
        <label className="flex min-w-0 flex-col gap-[5px]">
          <FieldLabel>Status code</FieldLabel>
          <Input
            type="number"
            min={200}
            max={599}
            value={response.status}
            placeholder={response.bodyMode === 'replace' ? '200' : 'Keep original'}
            onChange={(event) =>
              editRule(rule.id, (current) => {
                current.response.status = event.target.value;
              })
            }
            className="tabular-nums"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-[5px]">
          <FieldLabel>Delay (ms)</FieldLabel>
          {/* Whole milliseconds, never below 0: the field shows what's kept. */}
          <Input
            type="number"
            min={0}
            step={250}
            value={response.delay || ''}
            placeholder="0"
            onChange={(event) =>
              editRule(rule.id, (current) => {
                current.response.delay = Math.max(
                  0,
                  Math.round(Number(event.target.value) || 0),
                );
              })
            }
            className="tabular-nums"
          />
        </label>
        {response.bodyMode === 'replace' && (
          <label className="col-span-2 flex min-w-0 flex-col gap-[5px]">
            <FieldLabel>Content-Type</FieldLabel>
            <Input
              list="content-types"
              value={response.contentType}
              onChange={(event) =>
                editRule(rule.id, (current) => {
                  current.response.contentType = event.target.value;
                })
              }
            />
          </label>
        )}
      </div>
      {/* Click the chosen code again to clear it. */}
      <ToggleGroup
        aria-label="Status code"
        value={[response.status]}
        onValueChange={(values) =>
          editRule(rule.id, (current) => {
            current.response.status = (values as string[])[0] ?? '';
          })
        }
        className="grid grid-cols-6 border-0 border-t border-l"
      >
        {STATUS_PRESETS.map((preset) => (
          <ToggleGroupItem
            key={preset}
            value={String(preset)}
            data-testid={`status-${preset}`}
            className="h-[26px] border-r border-b border-input px-0 text-meta normal-case tracking-[inherit] not-first:border-l-0"
          >
            {preset}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <FieldLabel className="mt-1.5 block">Response headers</FieldLabel>
      <HeaderRows rule={rule} pick={(current) => current.response.headers} />
    </Card>
  );
}
