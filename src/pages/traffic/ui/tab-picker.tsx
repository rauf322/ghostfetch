// The page whose requests the log shows, picked from every web page open: its initial (rather than
// its favicon, which would load from the web), its title and its host.
import type { TrafficTab } from '../../../shared/api/index.ts';
import { splitUrl } from '../../../shared/lib/index.ts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../shared/ui/kit/select.tsx';

export function TabPicker({
  tabs,
  target,
  onPick,
}: {
  tabs: TrafficTab[];
  target: TrafficTab | null;
  onPick: (id: number | null) => void;
}) {
  return (
    <Select
      items={tabs.map((tab) => ({ value: String(tab.id), label: tab.title }))}
      value={target ? String(target.id) : null}
      onValueChange={(value) => onPick(value ? Number(value) : null)}
    >
      <SelectTrigger
        variant="bare"
        data-testid="traffic-tab"
        aria-label="Page to watch"
        className="h-9 w-auto max-w-full min-w-0 flex-[0_1_auto] gap-2 rounded-md pr-8 pl-1.5 hover:bg-hover focus-visible:shadow-none"
      >
        {target && (
          <span
            aria-hidden
            className="flex size-5 flex-none items-center justify-center rounded-[5px] bg-raised text-micro font-semibold text-foreground"
          >
            {/* The first character, whole: an emoji is two code units, and charAt would split it. */}
            {[...target.title.trim()][0]?.toUpperCase() || '·'}
          </span>
        )}
        <SelectValue
          placeholder="No web pages open"
          className="flex-[0_1_auto] font-medium"
        />
        {target && (
          <span className="hidden min-w-0 flex-[0_2_auto] truncate font-mono text-meta text-t40 @[520px]/traffic:inline">
            {splitUrl(target.url).host}
          </span>
        )}
      </SelectTrigger>
      <SelectContent>
        {tabs.map((tab) => (
          <SelectItem key={tab.id} value={String(tab.id)}>
            {tab.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
