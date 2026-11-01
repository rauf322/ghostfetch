// Segmented controls (one answer always) and a toggle group of chips that clear, both live.
import { useState } from 'react';
import { BODY_MODES, TYPES } from '../../../../shared/api/index.ts';
import type { RuleType } from '../../../../shared/api/index.ts';
import { Segmented, SegmentedItem } from '../../../../shared/ui/kit/segmented.tsx';
import { ToggleGroup, ToggleGroupItem } from '../../../../shared/ui/kit/toggle-group.tsx';
import { Cell, Output, Row } from '../cell.tsx';

const STATUS_PRESETS = [200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500, 503];

export function SegmentedSection({ index }: { index: number }) {
  const [type, setType] = useState('response');
  const [status, setStatus] = useState<string[]>(['404']);
  return (
    <Cell
      index={index}
      title="Segmented and toggle group"
      note="one answer always · chips that clear"
    >
      <Row label="Segmented (live: arrow keys choose)" className="flex flex-col gap-2">
        <Segmented
          value={type}
          onValueChange={(next) => setType(next as string)}
          aria-label="Rule type"
          data-testid="kit-segmented"
        >
          {Object.entries(TYPES).map(([key, item]) => (
            <SegmentedItem key={key} value={key}>
              {item.short}
            </SegmentedItem>
          ))}
        </Segmented>
        <Segmented defaultValue="original" aria-label="Response body">
          {Object.entries(BODY_MODES).map(([key, item]) => (
            <SegmentedItem key={key} value={key}>
              {item.label}
            </SegmentedItem>
          ))}
        </Segmented>
      </Row>
      <Row
        label="Toggle group (live: click the chosen code again to clear it)"
        className="flex flex-col gap-2"
      >
        <ToggleGroup
          value={status}
          onValueChange={(next) => setStatus(next as string[])}
          aria-label="Status code"
          data-testid="kit-chips"
          className="grid grid-cols-6 border-0 border-t border-l"
        >
          {STATUS_PRESETS.map((code) => (
            <ToggleGroupItem
              key={code}
              value={String(code)}
              data-testid={`kit-chip-${code}`}
              className="h-[26px] border-r border-b border-input px-0 text-meta tracking-[inherit] not-first:border-l-0"
            >
              {code}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Row>
      <Output testid="kit-choices">
        {TYPES[type as RuleType].short} · status {status[0] ?? 'none'}
      </Output>
    </Cell>
  );
}
