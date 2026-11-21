// A group in the rule list, as one block: its header, and under it (unless it's folded) its rules
// in their order, set in, or a line saying it has none yet, which a rule can be dropped on.
import { ruleRevision } from '../../../rules/index.ts';
import type { GroupEntry, Rule } from '../../../rules/index.ts';
import type { TrafficLog } from '../../../traffic/index.ts';
import { cn } from '../../../ui/cn.ts';
import type { ListDrag } from '../model/use-rule-drag.ts';
import { BLOCK_MARK } from './drop-marks.ts';
import { GroupHeader } from './group-header.tsx';
import { RuleListItem } from './rule-list-item.tsx';

export function GroupBlock({
  entry,
  all,
  folded,
  renaming,
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
  renaming: boolean;
  selectedId: string | null;
  drag: ListDrag;
  log: TrafficLog;
  onSelect: (id: string) => void;
  onCreate: (group: string) => void;
  onFold: () => void;
  onRename: (id: string) => void;
  onRenamed: () => void;
}) {
  const { group, rules } = entry;
  const header = drag.header(group);
  const block = drag.block(group);
  return (
    <li
      data-testid="group-block"
      data-drop={block.drop}
      {...block.handlers}
      className={cn('relative', BLOCK_MARK, header.dragging && 'opacity-40')}
    >
      <GroupHeader
        group={group}
        rules={all}
        folded={folded}
        renaming={renaming}
        drag={header}
        onFold={onFold}
        onRename={onRename}
        onRenamed={onRenamed}
        onCreate={onCreate}
      />
      {!folded &&
        (rules.length ? (
          <ul>
            {rules.map((rule) => (
              <RuleListItem
                key={rule.id}
                rule={rule}
                revision={ruleRevision(rule)}
                selected={rule.id === selectedId}
                drag={drag.rule(rule)}
                inGroup
                groupOff={group.enabled ? '' : group.name}
                log={log}
                onSelect={onSelect}
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
