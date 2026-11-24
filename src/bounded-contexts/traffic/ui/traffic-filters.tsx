// Which requests the list shows: All, Matched (a rule matched them) or Errors, each with how many
// there are, and a search by URL, status or rule. One filter is always chosen, so they're a radio
// group: the arrow keys move between them.
import { SearchField } from '../../../ui/list-detail.tsx';
import { Segmented, SegmentedItem } from '../../../ui/kit/segmented.tsx';
import { Tooltip } from '../../../ui/kit/tooltip.tsx';
import type { TrafficFilter } from '../domain/filter-entries.ts';

const FILTER_LABELS: Record<TrafficFilter, string> = {
  all: 'All',
  matched: 'Matched',
  errors: 'Errors',
};
const PLACEHOLDER = 'URL, status or rule';

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
            className="group/filter h-8 flex-none rounded-full bg-card px-3 data-checked:bg-foreground data-checked:text-inverse"
          >
            {FILTER_LABELS[name]}{' '}
            <span className="ml-0.5 font-normal text-t40 tabular-nums group-data-checked/filter:text-inverse/55">
              {counts[name]}
            </span>
          </SegmentedItem>
        ))}
      </Segmented>
      {/* The search goes under the filters when they'd leave it under 180 px, or under what its
          placeholder needs in the font and size in use (Appearance): an invisible copy of the
          placeholder (::after), with the field's padding, shares its cell of the grid. */}
      <div
        data-placeholder={PLACEHOLDER}
        className="grid flex-1 after:invisible after:col-start-1 after:row-start-1 after:h-0 after:min-w-[180px] after:overflow-hidden after:pr-2.5 after:pl-[34px] after:text-body after:whitespace-nowrap after:content-[attr(data-placeholder)]"
      >
        <div className="col-start-1 row-start-1 flex">
          <Tooltip label="Search by URL, method, status or rule name">
            <SearchField
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={PLACEHOLDER}
              aria-label="Search requests"
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
