// Which requests the list shows: All, Matched (a rule matched them) or Errors, each with how many
// there are, and a search by URL, status or rule. One filter is always chosen, so they're a radio
// group: the arrow keys move between them.
import { SearchField } from '../../../shared/ui/list-detail.tsx';
import { Segmented, SegmentedItem } from '../../../shared/ui/kit/segmented.tsx';
import type { TrafficFilter } from '../lib/filter-entries.ts';

const FILTER_LABELS: Record<TrafficFilter, string> = {
  all: 'All',
  matched: 'Matched',
  errors: 'Errors',
};

export function TrafficFilters({
  filter,
  counts,
  search,
  onFilterChange,
  onSearchChange,
}: {
  filter: TrafficFilter;
  counts: Record<TrafficFilter, number>;
  search: string;
  onFilterChange: (filter: TrafficFilter) => void;
  onSearchChange: (search: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        aria-label="Show"
        value={filter}
        onValueChange={(value) => onFilterChange(value as TrafficFilter)}
        className="flex-none gap-1.5 bg-transparent p-0"
      >
        {(Object.keys(FILTER_LABELS) as TrafficFilter[]).map((name) => (
          <SegmentedItem
            key={name}
            value={name}
            data-testid={`filter-${name}`}
            className="group/filter h-8 flex-none rounded-full bg-card px-3 data-checked:bg-foreground data-checked:text-black"
          >
            {FILTER_LABELS[name]}{' '}
            <span className="ml-0.5 font-normal text-t40 tabular-nums group-data-checked/filter:text-black/55">
              {counts[name]}
            </span>
          </SegmentedItem>
        ))}
      </Segmented>
      <div className="flex min-w-[180px] flex-1">
        <SearchField
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="URL, status or rule"
          title="Search by URL, method, status or rule name"
          aria-label="Search requests"
        />
      </div>
    </div>
  );
}
