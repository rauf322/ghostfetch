// One rule's settings, in numbered sections like the site's chapters ("02 — Match requests"):
// the rule type, then what the rule matches and what its type does. A response rule shows what it
// sends back first, then what it matches; the other types the other way round. Every change is
// saved as you make it (editRule) and applies to open tabs right away.
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
  const responseFirst = rule.type === 'response';

  // The two sections are keyed, so a type change swaps their places rather than starting them
  // over, and the URL tester keeps its text.
  const match = (
    <MatchSection
      key="match"
      rule={rule}
      index={responseFirst ? 3 : 2}
      focusUrl={focusUrl}
    />
  );
  const action = actionSection(rule, revision);

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
        {responseFirst ? [action, match] : [match, action]}
      </PaneScroll>
    </>
  );
}

// What the rule's type does: the response it sends back (02), where it redirects (03), the headers
// it changes (03 and 04), or nothing to set for a block.
function actionSection(rule: Rule, revision: number) {
  switch (rule.type) {
    case 'response':
      return <ResponseSection key="action" rule={rule} index={2} revision={revision} />;
    case 'redirect':
      return <RedirectSection key="action" rule={rule} index={3} />;
    case 'headers':
      return <HeaderSections key="action" rule={rule} index={3} />;
    default:
      return <BlockSection key="action" />;
  }
}
