// "Rule type": response, redirect, headers or block, and what that type does.
import { TYPES } from '../../../../entities/rule/index.ts';
import type { Rule, RuleType } from '../../../../entities/rule/index.ts';
import { Card, CardHint, CardTitle } from '../../../../shared/ui/kit/card.tsx';
import { Segmented, SegmentedItem } from '../../../../shared/ui/kit/segmented.tsx';
import { editRule } from '../../model/edit-rule.ts';

export function RuleTypeSection({ rule, index }: { rule: Rule; index: number }) {
  return (
    <Card>
      <CardTitle index={index}>Rule type</CardTitle>
      <Segmented
        aria-label="Rule type"
        value={rule.type}
        onValueChange={(type) =>
          editRule(rule.id, (current) => {
            current.type = type as RuleType;
          })
        }
      >
        {(Object.keys(TYPES) as RuleType[]).map((type) => (
          <SegmentedItem key={type} value={type} title={TYPES[type].desc}>
            {TYPES[type].short}
          </SegmentedItem>
        ))}
      </Segmented>
      {/* Each piece of text is one run, so it lines up to the pixel as in 0.5.1. Text that
          ends at a line break is a string, which oxfmt can't split at a space. */}
      <CardHint>
        {rule.type === 'response' ? (
          <>
            {`${TYPES.response.desc}. Applies to `}
            <code>fetch()</code> and <code>XMLHttpRequest</code>
            {' calls made by the page.'}
          </>
        ) : (
          `${TYPES[rule.type].desc}.`
        )}
      </CardHint>
    </Card>
  );
}
