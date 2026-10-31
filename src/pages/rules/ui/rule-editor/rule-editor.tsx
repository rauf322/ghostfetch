// One rule's settings, in numbered sections like the site's chapters ("02 — Match requests"):
// the rule type, then what the rule matches and what its type does. A response rule has those two
// in one section of tabs (Body, Status, Headers, Delay and Match), the last thing in the pane, so
// its body editor can take the room down to the pane's bottom. Every change is saved as you make
// it (editRule) and applies to open tabs right away.
import { useState } from 'react';
import { ruleStore, settingsStore } from '../../../../shared/api/index.ts';
import type { Rule } from '../../../../shared/api/index.ts';
import { useStore } from '../../../../shared/react/index.ts';
import { Alert } from '../../../../shared/ui/kit/alert.tsx';
import { PaneScroll } from '../../../../shared/ui/list-detail.tsx';
import { BlockSection } from './block-section.tsx';
import { HeaderSections } from './header-sections.tsx';
import { MatchSection } from './match-section.tsx';
import { RedirectSection } from './redirect-section.tsx';
import { ResponseSection } from './response-section.tsx';
import { RuleHeader } from './rule-header.tsx';
import { RuleTypeSection } from './rule-type-section.tsx';

interface RuleEditorProps {
  rule: Rule;
  // Put the cursor in the URL field, for a rule that was just created.
  focusUrl: boolean;
  // Moves when the rules were changed in another view, so the body editor starts over from them.
  revision: number;
  onSelect: (id: string | null) => void;
}

export function RuleEditor({ rule, focusUrl, revision, onSelect }: RuleEditorProps) {
  const { enabled } = useStore(settingsStore);
  const { dnrErrors } = useStore(ruleStore);
  const dnrError = rule.enabled && enabled ? dnrErrors[rule.id] : '';
  // The URL being tried against the pattern, which stays when the rule's type changes and its
  // match fields move between a tab and a section.
  const [testedUrl, setTestedUrl] = useState('');
  const match = { rule, focusUrl, testedUrl, onTestedUrlChange: setTestedUrl };

  return (
    <>
      <RuleHeader rule={rule} onSelect={onSelect} />
      <PaneScroll>
        {dnrError && (
          <Alert variant="error" data-testid="dnr-error" className="mx-3.5 mt-3.5">
            {`Chrome rejected this rule: ${dnrError}`}
          </Alert>
        )}
        <RuleTypeSection rule={rule} index={1} />
        {rule.type === 'response' ? (
          <ResponseSection {...match} index={2} revision={revision} />
        ) : (
          <>
            <MatchSection {...match} index={2} />
            {actionSection(rule)}
          </>
        )}
      </PaneScroll>
    </>
  );
}

// What another type of rule does: where it redirects (03), the headers it changes (03 and 04), or
// nothing to set for a block.
function actionSection(rule: Rule) {
  switch (rule.type) {
    case 'redirect':
      return <RedirectSection rule={rule} index={3} />;
    case 'headers':
      return <HeaderSections rule={rule} index={3} />;
    default:
      return <BlockSection />;
  }
}
