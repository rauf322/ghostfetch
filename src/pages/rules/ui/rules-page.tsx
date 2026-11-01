// Rules tab: the rule list, and beside it the open rule or, with none open, New rule ("What should
// Ghostfetch answer?"). In a narrow side panel only one of the two is visible at a time: the list,
// until a rule is opened or New rule is clicked. From 760px wide they sit side by side.
import { useEffect, useRef, useState } from 'react';
import { addRule, findRule, ruleStore } from '../../../shared/api/index.ts';
import type { Rule, TrafficLog } from '../../../shared/api/index.ts';
import { useStore } from '../../../shared/react/index.ts';
import { DetailPane, Split } from '../../../shared/ui/list-detail.tsx';
import { FieldSuggestions } from './field-suggestions.tsx';
import { NewRule } from './new-rule/new-rule.tsx';
import { RuleEditor } from './rule-editor/rule-editor.tsx';
import { RuleList } from './rule-list.tsx';

interface RulesPageProps {
  // The editor's log of the page it watches.
  log: TrafficLog;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  // Makes a rule of a captured request and opens it (the editor's, as Traffic's Mock does).
  onMock: (draft: Rule) => void;
  onOpenTraffic: () => void;
  onImport: () => void;
  onExport: () => void;
}

export function RulesPage({
  log,
  selectedId,
  onSelect,
  onMock,
  onOpenTraffic,
  onImport,
  onExport,
}: RulesPageProps) {
  // Draws again when the rules change, here or in another view.
  useStore(ruleStore);
  const [query, setQuery] = useState('');
  // New rule was clicked: in a narrow panel it takes the list's place, with the cursor in it.
  const [composing, setComposing] = useState(false);
  // A rule New rule just made, whose body gets the cursor.
  const [created, setCreated] = useState<string | null>(null);
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

  function select(id: string | null) {
    setCreated(null);
    setComposing(false);
    onSelect(id);
  }

  function compose() {
    setQuery('');
    select(null);
    setComposing(true);
  }

  // A new rule goes first in the list, open with the cursor in its body.
  function create(rule: Rule) {
    setQuery('');
    const added = addRule(rule, 0);
    select(added.id);
    setCreated(added.id);
  }

  const picked = Boolean(selected) || composing;
  return (
    <>
      <Split>
        <RuleList
          selectedId={selectedId}
          picked={picked}
          query={query}
          onQueryChange={setQuery}
          onSelect={select}
          onCreate={compose}
          onImport={onImport}
          onExport={onExport}
        />
        <DetailPane ref={editorPane} picked={picked}>
          {selected ? (
            <RuleEditor
              key={selected.id}
              rule={selected}
              log={log}
              focusBody={created === selected.id}
              revision={revision}
              onSelect={select}
            />
          ) : (
            <NewRule
              log={log}
              focus={composing}
              onCreate={create}
              onMock={(draft) => {
                setComposing(false);
                onMock(draft);
              }}
              onCancel={() => setComposing(false)}
              onOpenTraffic={onOpenTraffic}
            />
          )}
        </DetailPane>
      </Split>
      <FieldSuggestions />
    </>
  );
}
