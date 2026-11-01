// One rule's settings: its name along the top, then a section of tabs (Body, Status, Headers,
// Delay and Match), the only thing in the pane, so the body editor can take the room down to the
// pane's bottom. Every change is saved as you make it (editRule) and applies to open tabs right
// away.
import type { Rule } from '../../../../shared/api/index.ts';
import { PaneScroll } from '../../../../shared/ui/list-detail.tsx';
import { RuleHeader } from './rule-header.tsx';
import { RuleTabs } from './rule-tabs.tsx';

interface RuleEditorProps {
  rule: Rule;
  // Put the cursor in the URL field, for a rule that was just created.
  focusUrl: boolean;
  // Moves when the rules were changed in another view, so the body editor starts over from them.
  revision: number;
  onSelect: (id: string | null) => void;
}

export function RuleEditor({ rule, focusUrl, revision, onSelect }: RuleEditorProps) {
  return (
    <>
      <RuleHeader rule={rule} onSelect={onSelect} />
      <PaneScroll>
        <RuleTabs rule={rule} focusUrl={focusUrl} revision={revision} />
      </PaneScroll>
    </>
  );
}
