// A group in the rule list, as one block: its header, and under it (unless it's folded) its rules
// in their order, set in, or a line saying it has none yet, which a rule can be dropped on. In the
// list's tree the block is the group's item: it takes focus (its header shows the ring), named by
// the group's name, expanded or not as it's folded, with its rules a level under it.
import { useId } from 'react';
import { ruleRevision } from '../index.ts';
import type { GroupEntry, Rule } from '../index.ts';
import type { TrafficLog } from '../../traffic/index.ts';
import { cn } from '../../../ui/cn.ts';
import type { ListDrag } from './use-rule-drag.ts';
import { BLOCK_MARK } from './drop-marks.ts';
import { GroupHeader } from './group-header.tsx';
import { RuleListItem } from './rule-list-item.tsx';

export function GroupBlock({
  entry,
  all,
  folded,
  renaming,
  stop,
  position,
  count,
  selectedId,
  drag,
  log,
  onSelect,
  onCreate,
  onFold,
  onRename,
  onRenamed,
}: {
  // The group, with the rules of it the search shows.
  entry: GroupEntry;
  // All of its rules.
  all: Rule[];
  folded: boolean;
  // The group or rule whose name is a field now, if any.
  renaming: string | null;
  // The list's Tab stop: the item the keyboard enters the list at.
  stop: string | null;
  // Where the group stands among the list's top-level items, from 1.
  position: number;
  count: number;
  selectedId: string | null;
  drag: ListDrag;
  log: TrafficLog;
  onSelect: (id: string | null) => void;
  onCreate: (group: string) => void;
  onFold: () => void;
  onRename: (id: string) => void;
  onRenamed: (id: string, byKey: boolean) => void;
}) {
  const { group, rules } = entry;
  const header = drag.header(group);
  const block = drag.block(group);
  const nameId = useId();
  return (
    <li
      data-testid="group-block"
      data-item={group.id}
      data-kind="group"
      data-drop={block.drop}
      role="treeitem"
      aria-level={1}
      aria-posinset={position}
      aria-setsize={count}
      aria-expanded={all.length ? !folded : undefined}
      aria-labelledby={nameId}
      tabIndex={group.id === stop ? 0 : -1}
      {...block.handlers}
      className={cn(
        'group/block relative focus-visible:outline-none',
        BLOCK_MARK,
        header.dragging && 'opacity-40',
      )}
    >
      <GroupHeader
        group={group}
        rules={all}
        folded={folded}
        renaming={renaming === group.id}
        tabbable={group.id === stop}
        nameId={nameId}
        drag={header}
        onFold={onFold}
        onRename={onRename}
        onRenamed={(byKey) => onRenamed(group.id, byKey)}
        onCreate={onCreate}
      />
      {!folded &&
        (rules.length ? (
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a tree's nested items are a group, which no element is
          <ul role="group">
            {rules.map((rule, index) => (
              <RuleListItem
                key={rule.id}
                rule={rule}
                revision={ruleRevision(rule)}
                selected={rule.id === selectedId}
                drag={drag.rule(rule)}
                inGroup
                groupOff={group.enabled ? '' : group.name}
                log={log}
                tabbable={rule.id === stop}
                renaming={renaming === rule.id}
                position={index + 1}
                count={rules.length}
                onSelect={onSelect}
                onRenamed={onRenamed}
              />
            ))}
          </ul>
        ) : (
          <p
            data-testid="group-empty"
            {...drag.empty(group)}
            className="mx-1.5 py-2 pr-3 pl-[26px] text-meta text-t40"
          >
            No rules yet: drag one here, or click +.
          </p>
        ))}
    </li>
  );
}
