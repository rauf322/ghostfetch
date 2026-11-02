// One of New rule's pickers under the input, as a small filled pill with its icon: the method,
// how the URL is compared, the status and the delay. A select: Base UI does the keyboard.
import type { IconName } from '../../../../shared/ui/kit/icon.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../shared/ui/kit/select.tsx';

export function Picker({
  icon,
  label,
  value,
  items,
  onChange,
  testid,
}: {
  icon: IconName;
  // What it picks, for a screen reader.
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (value: string) => void;
  testid: string;
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => onChange(next as string)}
    >
      <SelectTrigger
        variant="bare"
        size="sm"
        aria-label={label}
        data-testid={testid}
        className="w-auto flex-none gap-1.5 rounded-md bg-pressed pr-7 pl-2.5 text-control hover:bg-raised focus-visible:shadow-none"
      >
        <Icon name={icon} size={14} className="flex-none text-t50" />
        <SelectValue className="flex-none" />
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
