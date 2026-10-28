// One rule's settings, in numbered sections like the site's chapters ("02 — Match requests"):
// the rule type and what it matches for every rule, then what its type does. Every change is
// saved as you make it (editRule) and applies to open tabs right away.
import { ruleStore, settingsStore } from '../../../../shared/api/index.ts';
import type { Rule } from '../../../../shared/api/index.ts';
import { useStore } from '../../../../shared/react/index.ts';
import { Alert } from '../../../../shared/ui/kit/alert.tsx';
import { PaneScroll } from '../../../../shared/ui/list-detail.tsx';
import { BlockSection } from './block-section.tsx';
import { BodySection } from './body-section.tsx';
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

  // The sections keep their places whatever the type, so the URL tester keeps its text when the
  // type changes.
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
        <MatchSection rule={rule} index={2} focusUrl={focusUrl} />
        {rule.type === 'response' && (
          <>
            <BodySection rule={rule} index={3} revision={revision} />
            <ResponseSection rule={rule} index={4} />
          </>
        )}
        {rule.type === 'redirect' && <RedirectSection rule={rule} index={3} />}
        {rule.type === 'headers' && <HeaderSections rule={rule} index={3} />}
        {rule.type === 'block' && <BlockSection />}
      </PaneScroll>
    </>
  );
}
