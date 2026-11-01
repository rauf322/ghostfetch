// Rules tab: the rule list and the rule editor. In a narrow side panel only one of the
// two is visible at a time; from 760px wide they sit side by side.
import { useEffect, useRef, useState } from 'react';
import { addRule, createRule, findRule, ruleStore } from '../../../shared/api/index.ts';
import type { TrafficLog } from '../../../shared/api/index.ts';
import { useStore } from '../../../shared/react/index.ts';
import { DetailPane, Split } from '../../../shared/ui/list-detail.tsx';
import { FieldSuggestions } from './field-suggestions.tsx';
import { NoRuleSelected } from './no-rules.tsx';
import { RuleEditor } from './rule-editor/rule-editor.tsx';
import { RuleList } from './rule-list.tsx';

interface RulesPageProps {
  // The editor's log of the page it watches.
  log: TrafficLog;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onImport: () => void;
  onExport: () => void;
}

export function RulesPage({
  log,
  selectedId,
  onSelect,
  onImport,
  onExport,
}: RulesPageProps) {
  const { rules } = useStore(ruleStore);
  const [query, setQuery] = useState('');
  // A rule that was just created, whose URL field gets the cursor.
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
    onSelect(id);
  }

  // A new rule goes first in the list, open with its URL row open.
  function create() {
    setQuery('');
    const rule = addRule(createRule(), 0);
    onSelect(rule.id);
    setCreated(rule.id);
  }

  return (
    <>
      <Split>
        <RuleList
          selectedId={selectedId}
          picked={Boolean(selected)}
          query={query}
          onQueryChange={setQuery}
          onSelect={select}
          onCreate={create}
          onImport={onImport}
          onExport={onExport}
        />
        <DetailPane ref={editorPane} picked={Boolean(selected)}>
          {selected ? (
            <RuleEditor
              key={selected.id}
              rule={selected}
              log={log}
              focusUrl={created === selected.id}
              revision={revision}
              onSelect={select}
            />
          ) : (
            <NoRuleSelected hasRules={rules.length > 0} onCreate={create} />
          )}
        </DetailPane>
      </Split>
      <FieldSuggestions />
    </>
  );
}
