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
} from '../../../shared/api/index.ts';
import type { TrafficLog } from '../../../shared/api/index.ts';
import { useStore } from '../../../shared/react/index.ts';
import { foldStore, isFolded, setFolded } from '../../../shared/ui/group-folds.ts';
import { Button } from '../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../shared/ui/kit/icon.tsx';
import { ListEmpty } from '../../../shared/ui/list-detail.tsx';
import { filterEntries } from '../lib/filter-rules.ts';
import { renameGroup, renamingStore } from '../model/renaming.ts';
import { useRuleDrag } from '../model/use-rule-drag.ts';
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
  const drag = useRuleDrag();
  const { id: renaming } = useStore(renamingStore);
  const searching = Boolean(query.trim());
  const visible = filterEntries(entries, query);
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

  // A rule opened in a folded group (from Traffic, the popup, or just made in it) unfolds it.
  useEffect(() => {
    const group = findRule(selectedId)?.group;
    if (group && isFolded(group)) setFolded(group, false);
  }, [selectedId]);

  function newGroup() {
    const group = addGroup(createGroup(freeName(NEW_GROUP, ruleStore.state.groups)), 0);
    renameGroup(group.id);
  }

  return (
    // A container: a group's header shows how many of its rules are on where there's room.
    <div
      data-testid="rule-list"
      className="@container/rules min-h-0 flex-1 overflow-auto py-1 scroll-thin"
    >
      {none ? (
        <ListEmpty>
          <p>{`No rules match “${query}”.`}</p>
        </ListEmpty>
      ) : (
        <section>
          {/* The label starts over the rules' dots. */}
          <div className="flex h-9 items-center justify-between pt-2 pr-2 pl-[22px]">
            <h2 className="text-label font-medium text-t40 tabular-nums">
              {shown.length ? `${on} of ${shown.length} on` : 'Rules'}
            </h2>
            <div className="-my-1 -mr-1.5 flex items-center">
              <Button
                variant="ghost"
                size="icon-sm"
                data-testid="new-group"
                aria-label="New group"
                title="New group"
                onClick={newGroup}
              >
                <Icon name="newgroup" size={15} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                data-testid="new-rule"
                aria-label="New rule"
                title="New rule"
                onClick={() => onCreate()}
              >
                <Icon name="plus" size={15} />
              </Button>
            </div>
          </div>
          <ul>
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
                  onRename={renameGroup}
                  onRenamed={() => renameGroup(null)}
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
