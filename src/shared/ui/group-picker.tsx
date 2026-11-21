// Which group a new rule goes into, where New rule and Mock this response make one: a small filled
// pill like New rule's other pickers, offering No group and each group, in their order. One that's
// off says so, as a rule made in it doesn't answer until it's on. Nothing shows until there's a
// group, so the screens stay as they were for anyone who doesn't make one.
import { ruleStore } from '../api/index.ts';
import { useStore } from '../../ui/use-store.ts';
import { cn } from '../../ui/cn.ts';
import { Icon } from '../../ui/kit/icon.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/kit/select.tsx';

// No group, as the select's value: not an id a group can have.
const NONE = '*none';

export function GroupPicker({
  value,
  onChange,
  className,
}: {
  // The group's id, or '' for none.
  value: string;
  onChange: (group: string) => void;
  className?: string;
}) {
  const { groups } = useStore(ruleStore);
  if (!groups.length) return null;
  const items = [
    { value: NONE, label: 'No group' },
    ...groups.map((group) => ({
      value: group.id,
      label: group.enabled ? group.name : `${group.name} (off)`,
    })),
  ];
  // A group deleted meanwhile is none.
  const current = groups.some((group) => group.id === value) ? value : NONE;
  return (
    <Select
      items={items}
      value={current}
      onValueChange={(next) => onChange(next === NONE ? '' : (next as string))}
    >
      <SelectTrigger
        variant="bare"
        size="sm"
        aria-label="Group the rule goes into"
        title="The group the rule goes into"
        data-testid="picker-group"
        className={cn(
          'w-auto max-w-56 min-w-0 flex-none gap-1.5 rounded-md bg-pressed pr-7 pl-2.5 text-control hover:bg-raised focus-visible:shadow-none',
          className,
        )}
      >
        <Icon name="group" size={14} className="flex-none text-t50" />
        <SelectValue className="min-w-0 truncate" />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
