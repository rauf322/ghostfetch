// The rules in the sidebar, in their order, under how many of them are on ("12 of 14 on"), New
// group, and the + that makes a new rule. A rule's place in the list is its priority
// (docs/adr/0001): rules are tried top to bottom, and the first match wins; drag one to move it,
// into a group or out of one, or a group's header to move the group with its rules. A group is a
// block in the list: its header, then its rules, set in, unless it's folded. A rule's dot turns it
// on or off, as a group's does the group; one that's off stays where it is, its dot grey. Search
// narrows the list.
import { useEffect } from 'react';
import {
  NEW_GROUP,
  addGroup,
  createGroup,
  findRule,
  freeName,
  ruleRevision,
  ruleStore,
} from '../index.ts';
import { filterEntries } from '../domain/filter-rules.ts';
import type { TrafficLog } from '../../traffic/index.ts';
import { useStore } from '../../../ui/use-store.ts';
import { foldStore, isFolded, setFolded } from './group-folds.ts';
import { Button } from '../../../ui/kit/button.tsx';
import { Icon } from '../../../ui/kit/icon.tsx';
import { Tooltip } from '../../../ui/kit/tooltip.tsx';
import { ListEmpty } from '../../../ui/list-detail.tsx';
import { renamingStore, setRenaming } from './renaming.ts';
import { useRuleDrag } from './use-rule-drag.ts';
import { GroupBlock } from './group-block.tsx';
import { NoRulesYet } from './no-rules.tsx';
import { RuleListItem } from './rule-list-item.tsx';

interface RuleListProps {
  selectedId: string | null;
  query: string;
  onSelect: (id: string) => void;
  // New rule: the + (in the group New rule offers), or a group's + (in that group).
  onCreate: (group?: string) => void;
  // The editor's log of the page it watches: what each rule did there.
  log: TrafficLog;
}

export function RuleList({ selectedId, query, onSelect, onCreate, log }: RuleListProps) {
  const { entries } = useStore(ruleStore);
  useStore(foldStore);
  const { id: renaming } = useStore(renamingStore);
  const searching = Boolean(query.trim());
  const visible = filterEntries(entries, query);
  const drag = useRuleDrag(visible.at(-1));
  const shown = visible.flatMap((entry) =>
    entry.kind === 'rule' ? [entry.rule] : entry.rules,
  );
  const none = Boolean(entries.length) && !visible.length;
  const on = shown.filter((rule) => rule.enabled).length;
  // Each group's rules, whatever the search shows of them: what its header counts.
  const all = new Map(
    entries.flatMap((entry) =>
      entry.kind === 'group' ? [[entry.group.id, entry.rules] as const] : [],
    ),
  );

  // A rule opened in a folded group (from Traffic, the popup, or just made in it) unfolds it, and
  // so does the open rule moved into one (its ⋯ menu's Move to group, or a drag), so the rule
  // stays in sight, picked: on opening a rule, and on the open rule going to another group.
  // Folding the open rule's group by hand leaves it folded.
  const selectedGroup = findRule(selectedId)?.group ?? '';
  useEffect(() => {
    if (selectedId && selectedGroup && isFolded(selectedGroup))
      setFolded(selectedGroup, false);
  }, [selectedId, selectedGroup]);

  function newGroup() {
    const group = addGroup(createGroup(freeName(NEW_GROUP, ruleStore.state.groups)), 0);
    setRenaming(group.id);
  }

  return (
    // A container: a group's header shows how many of its rules are on where there's room. A
    // rule or group dragged under the last entry goes to the end of the list (use-rule-drag.ts),
    // so there's always a little room under it, however long the list.
    <div
      data-testid="rule-list"
      className="@container/rules min-h-0 flex-1 overflow-auto py-1 scroll-thin"
      {...drag.list()}
    >
      {none ? (
        <ListEmpty>
          <p>{`No rules match “${query}”.`}</p>
        </ListEmpty>
      ) : (
        <section className="pb-3">
          {/* The label starts over the rules' dots. */}
          <div className="flex h-9 items-center justify-between pt-2 pr-2 pl-[22px]">
            <h2 className="text-label font-medium text-t40 tabular-nums">
              {shown.length ? `${on} of ${shown.length} on` : 'Rules'}
            </h2>
            <div className="-my-1 -mr-1.5 flex items-center">
              <Tooltip label="New group">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  data-testid="new-group"
                  aria-label="New group"
                  onClick={newGroup}
                >
                  <Icon name="newgroup" size={15} />
                </Button>
              </Tooltip>
              <Tooltip label="New rule">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  data-testid="new-rule"
                  aria-label="New rule"
                  onClick={() => onCreate()}
                >
                  <Icon name="plus" size={15} />
                </Button>
              </Tooltip>
            </div>
          </div>
          <ul data-entries>
            {visible.map((entry) =>
              entry.kind === 'rule' ? (
                <RuleListItem
                  key={entry.rule.id}
                  rule={entry.rule}
                  revision={ruleRevision(entry.rule)}
                  selected={entry.rule.id === selectedId}
                  drag={drag.rule(entry.rule)}
                  inGroup={false}
                  groupOff=""
                  log={log}
                  onSelect={onSelect}
                />
              ) : (
                <GroupBlock
                  key={entry.group.id}
                  entry={entry}
                  all={all.get(entry.group.id) ?? entry.rules}
                  // A search shows what it found, folded or not.
                  folded={!searching && isFolded(entry.group.id)}
                  renaming={renaming === entry.group.id}
                  selectedId={selectedId}
                  drag={drag}
                  log={log}
                  onSelect={onSelect}
                  onCreate={onCreate}
                  onFold={() => setFolded(entry.group.id, !isFolded(entry.group.id))}
                  onRename={setRenaming}
                  onRenamed={() => setRenaming(null)}
                />
              ),
            )}
          </ul>
        </section>
      )}
      {!entries.length && <NoRulesYet />}
    </div>
  );
}
