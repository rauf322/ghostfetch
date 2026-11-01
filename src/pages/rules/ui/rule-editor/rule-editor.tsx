// One rule, after the mockup's rule page: its state, name and what it does in a sentence, then its
// settings as two cards of rows (When a request matches, Respond with), a field to try a URL, and
// the body. A row opens its editor in place, one at a time. Every change is saved as you make it
// (editRule) and applies to open tabs right away.
//
// In a pane 760 px wide or more the settings and the body sit side by side, each as tall as the
// pane: the settings scroll on their own and the body editor takes the rest. In a narrower one
// (a side panel) it's one column: the settings, the body, then the URL to try. The pane is a size
// container (pane), which the layout asks the width of and the body editor the height.
import { useState } from 'react';
import type { Rule, TrafficLog } from '../../../../shared/api/index.ts';
import { PaneScroll } from '../../../../shared/ui/list-detail.tsx';
import { codeStatus } from '../../lib/rule-checks.ts';
import { useSettledStatus } from '../../model/use-settled-status.ts';
import { BodyCard } from './body-card.tsx';
import { MatchSettings } from './match-settings.tsx';
import { ResponseSettings } from './response-settings.tsx';
import { RuleHeader } from './rule-header.tsx';
import { RuleIntro } from './rule-intro.tsx';
import { SettingsSection } from './settings-card.tsx';
import { UrlTester } from './url-tester.tsx';

interface RuleEditorProps {
  rule: Rule;
  // The editor's log of the page it watches, for how often the rule fired there.
  log: TrafficLog;
  // A rule New rule just made: put the cursor in its body.
  focusBody: boolean;
  // Moves when the rules were changed in another view, so the body editor starts over from them.
  revision: number;
  onSelect: (id: string | null) => void;
}

export function RuleEditor({
  rule,
  log,
  focusBody,
  revision,
  onSelect,
}: RuleEditorProps) {
  // The row whose editor is open, in either card.
  const [open, setOpen] = useState<string | null>(null);
  // The URL being tried, kept here so it stays as rows open and close.
  const [testedUrl, setTestedUrl] = useState('');
  const status = useSettledStatus(codeStatus(rule), rule.response.body.length);

  return (
    <>
      <RuleHeader rule={rule} onSelect={onSelect} />
      <PaneScroll className="@container-size/pane">
        <div className="flex flex-col gap-5 px-4 pt-1 pb-4 @[760px]/pane:h-full @[760px]/pane:px-6">
          <RuleIntro rule={rule} log={log} />
          <div className="flex flex-col gap-5 @[760px]/pane:grid @[760px]/pane:min-h-0 @[760px]/pane:flex-1 @[760px]/pane:grid-cols-[minmax(290px,40%)_minmax(0,1fr)] @[760px]/pane:gap-6">
            {/* Side by side, a column that scrolls on its own; in one column, its sections
                go in with the body, and the URL to try goes last. */}
            <div className="contents @[760px]/pane:-mr-2 @[760px]/pane:flex @[760px]/pane:min-h-0 @[760px]/pane:flex-col @[760px]/pane:gap-5 @[760px]/pane:overflow-auto @[760px]/pane:pr-2 @[760px]/pane:scroll-thin">
              <SettingsSection label="When a request matches">
                <MatchSettings rule={rule} open={open} onOpenChange={setOpen} />
              </SettingsSection>
              <SettingsSection label="Respond with">
                <ResponseSettings rule={rule} open={open} onOpenChange={setOpen} />
              </SettingsSection>
              <SettingsSection
                label="Try a URL"
                className="order-last @[760px]/pane:order-none"
              >
                <UrlTester rule={rule} url={testedUrl} onUrlChange={setTestedUrl} />
              </SettingsSection>
            </div>
            <BodyCard
              rule={rule}
              revision={revision}
              status={status}
              focus={focusBody}
              className="@[760px]/pane:min-h-0"
            />
          </div>
        </div>
      </PaneScroll>
    </>
  );
}
