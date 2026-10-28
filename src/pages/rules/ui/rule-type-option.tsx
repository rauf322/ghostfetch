// The four rule types to pick from: as one option (its badge, its name and what it does) in the
// New rule menu, and as a column of buttons where there are no rules (yet) to show.
import type { ComponentProps } from 'react';
import { TYPES } from '../../../shared/api/index.ts';
import type { RuleType } from '../../../shared/api/index.ts';
import { cn } from '../../../shared/ui/cn.ts';
import { Badge } from '../../../shared/ui/kit/badge.tsx';

export function RuleTypeOption({ type }: { type: RuleType }) {
  const { short, label, desc } = TYPES[type];
  return (
    <>
      <Badge className="mt-0.5 min-w-[78px] text-t65">{short}</Badge>
      <span className="flex min-w-0 flex-col gap-0.5">
        <b className="font-medium">{label}</b>
        <small className="text-meta leading-[1.45] text-t40">{desc}</small>
      </span>
    </>
  );
}

export function RuleTypeCards({
  onPick,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'onClick'> & {
  onPick: (type: RuleType) => void;
}) {
  return (
    <div className={cn('grid border border-input text-left', className)} {...props}>
      {(Object.keys(TYPES) as RuleType[]).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onPick(type)}
          className="flex w-full items-start gap-3 border-b border-input px-3 py-[11px] text-left text-foreground last:border-b-0 hover:bg-pressed"
        >
          <RuleTypeOption type={type} />
        </button>
      ))}
    </div>
  );
}
