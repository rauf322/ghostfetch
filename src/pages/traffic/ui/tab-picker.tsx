// The page whose requests the log shows, picked from every web page open.
import { Label } from '../../../shared/ui/kit/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../shared/ui/kit/select.tsx';
import { PaneToolbar } from '../../../shared/ui/list-detail/index.ts';
import type { TrafficTab } from '../model/traffic-log.ts';

export function TabPicker({
  tabs,
  targetId,
  onPick,
}: {
  tabs: TrafficTab[];
  targetId: number | null;
  onPick: (id: number | null) => void;
}) {
  return (
    <PaneToolbar>
      <div className="flex min-w-0 flex-1 items-center gap-2.5 pl-3.5">
        <Label>Tab</Label>
        <Select
          items={tabs.map((tab) => ({
            value: String(tab.id),
            label: tab.title,
          }))}
          value={targetId == null ? null : String(targetId)}
          onValueChange={(value) => onPick(value ? Number(value) : null)}
        >
          <SelectTrigger
            variant="bare"
            data-testid="traffic-tab"
            aria-label="Tab to inspect"
            className="flex-1"
          >
            <SelectValue placeholder="No web pages open" />
          </SelectTrigger>
          <SelectContent>
            {tabs.map((tab) => (
              <SelectItem key={tab.id} value={String(tab.id)}>
                {tab.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </PaneToolbar>
  );
}
