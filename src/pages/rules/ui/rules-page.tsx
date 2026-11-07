// Rules: beside the sidebar, the open rule or, with none open, New rule ("What should Ghostfetch
// answer?"). In a narrow side panel it takes the sidebar's place once a rule is opened or New rule
// is clicked (the + in the sidebar), with a button back (app/sidepanel/editor.tsx decides which
// of the two shows).
import { useEffect, useRef, useState } from 'react';
import { findRule, ruleStore } from '../../../shared/api/index.ts';
import type { LogEntry, Rule, TrafficLog } from '../../../shared/api/index.ts';
import { useStore } from '../../../shared/react/index.ts';
import { DetailPane } from '../../../shared/ui/list-detail.tsx';
import { FieldSuggestions } from './field-suggestions.tsx';
import { NewRule } from './new-rule/new-rule.tsx';
import { RuleEditor } from './rule-editor/rule-editor.tsx';

interface RulesPageProps {
  // The editor's log of the page it watches.
  log: TrafficLog;
  selectedId: string | null;
  // New rule was clicked, and no rule has been opened since: the composer, with the cursor in it.
  composing: boolean;
  // A rule New rule just made, whose body gets the cursor, once: the body says when it has it.
  created: string | null;
  onSelect: (id: string | null) => void;
  // New rule made a rule.
  onCreate: (rule: Rule) => void;
  onBodyFocused: () => void;
  // New rule's back button, in a narrow panel.
  onCancel: () => void;
  // Makes a rule of a captured request and opens it (the editor's, as Traffic's Mock does).
  onMock: (rule: Rule, entry: LogEntry) => void;
  onOpenTraffic: () => void;
}

export function RulesPage({
  log,
  selectedId,
  composing,
  created,
  onSelect,
  onCreate,
  onBodyFocused,
  onCancel,
  onMock,
  onOpenTraffic,
}: RulesPageProps) {
  // Draws again when the rules change, here or in another view.
  useStore(ruleStore);
  // Counts the times the rules were changed in another view (the popup, another window) while the
  // editor didn't have focus. The body editor keeps its own text, so it starts over from the new
  // copy then; with focus in the editor, what you're typing stays.
  const [revision, setRevision] = useState(0);
  const editorPane = useRef<HTMLElement>(null);
  const selected = findRule(selectedId);

  useEffect(
    () =>
      ruleStore.subscribe((change) => {
        if (change === 'rules' && !editorPane.current?.contains(document.activeElement))
          setRevision((count) => count + 1);
      }),
    [],
  );

  return (
    <>
      <DetailPane ref={editorPane}>
        {selected ? (
          <RuleEditor
            key={selected.id}
            rule={selected}
            log={log}
            focusBody={created === selected.id}
            onBodyFocused={onBodyFocused}
            revision={revision}
            onSelect={onSelect}
          />
        ) : (
          <NewRule
            log={log}
            focus={composing}
            onCreate={onCreate}
            onMock={onMock}
            onCancel={onCancel}
            onOpenTraffic={onOpenTraffic}
          />
        )}
      </DetailPane>
      <FieldSuggestions />
    </>
  );
}
