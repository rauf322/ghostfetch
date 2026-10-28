// What the Rules tab shows with nothing to edit: in the list (a narrow panel, where the editor's
// side is hidden) when there are no rules yet, and in the editor's place when none is open.
import type { RuleType } from '../../../shared/api/index.ts';
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '../../../shared/ui/kit/empty.tsx';
import { ListEmpty } from '../../../shared/ui/list-detail.tsx';
import { RuleTypeCards } from './rule-type-option.tsx';

export function NoRulesYet({ onPick }: { onPick: (type: RuleType) => void }) {
  return (
    // In a narrow panel, where the editor's own empty state is hidden.
    <ListEmpty className="wide:hidden">
      <p>
        <strong>No rules yet.</strong> Pick what you want to do:
      </p>
      <RuleTypeCards onPick={onPick} />
      {/* Text that ends at a line break is a string, which oxfmt can't split at a space:
          each piece stays one run of text, so it lines up to the pixel as in 0.5.1. */}
      <p className="text-meta leading-[1.55] text-t40">
        Or open <b>Traffic</b>
        {', click a request and choose '}
        <b>Mock this response</b>.
      </p>
    </ListEmpty>
  );
}

export function NoRuleSelected({
  hasRules,
  onPick,
}: {
  hasRules: boolean;
  onPick: (type: RuleType) => void;
}) {
  return (
    <Empty>
      <EmptyMedia>
        <img src="/icons/icon128.png" width={56} height={56} alt="" />
      </EmptyMedia>
      <EmptyTitle>
        {hasRules ? 'Select a rule to edit it' : 'Create your first rule'}
      </EmptyTitle>
      <EmptyDescription>
        Rules apply on every site Ghostfetch runs on while it's switched on. The quickest
        start: open <b>Traffic</b>
        {', click a request and choose '}
        <b>Mock this response</b>.
      </EmptyDescription>
      <RuleTypeCards onPick={onPick} />
    </Empty>
  );
}
