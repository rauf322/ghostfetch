// The row over the body that turns its Diff on and off (after T3 Code's Changes row,
// GitActionsControl.tsx): what Diff compares the body with, and at its end how many lines the
// body adds to the server's response and takes out of it, each only where there are some, the
// added in the signal's colour and the taken out in grey (Ghostfetch has no red). Counted from
// the diff Diff draws (useTextDiff(), body-card.tsx), as of the last pause in typing. Where the
// diff gave up (the two bodies more than its limit of changes apart, src/lib/diff.ts) it has no
// counts, as Diff's own header has none: they'd count the lines shown removed and added whole,
// not the fewest that changed. Pressed while Diff shows, in the editor's place. A rule with no
// server's response yet has no row.
import type { TextDiff } from '../../../../lib/index.ts';
import { Icon } from '../../../../ui/kit/icon.tsx';

export function DiffRow({
  diff,
  on,
  onToggle,
}: {
  diff: TextDiff | null;
  on: boolean;
  onToggle: (on: boolean) => void;
}) {
  const counted = diff && !diff.gaveUp ? diff : null;
  const added = counted?.added ?? 0;
  const removed = counted?.removed ?? 0;
  // For a screen reader, the counts in words.
  const said = [
    added && `${added} ${added === 1 ? 'line' : 'lines'} added`,
    removed && `${removed} removed`,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <button
      type="button"
      data-testid="diff-switch"
      aria-pressed={on}
      onClick={() => onToggle(!on)}
      className="group/diff flex h-8 w-full min-w-0 flex-none items-center gap-2 rounded-md px-2 text-left text-control outline-offset-[-2px] hover:bg-hover aria-pressed:bg-pressed"
    >
      <Icon
        name="diff"
        size={15}
        className="text-t50 group-hover/diff:text-t80 group-aria-pressed/diff:text-t80"
      />
      <span className="flex-none font-medium text-t80 group-aria-pressed/diff:text-strong">
        Diff
      </span>
      <span className="min-w-0 truncate text-t50">vs server's response</span>
      <span
        data-testid="diff-row-counts"
        aria-hidden="true"
        className="ml-auto flex flex-none items-center gap-1.5 pl-2 font-mono text-meta tabular-nums"
      >
        {added > 0 && <span className="text-signal">{`+${added}`}</span>}
        {removed > 0 && <span className="text-t65">{`−${removed}`}</span>}
      </span>
      {said && <span className="sr-only">{`, ${said}`}</span>}
    </button>
  );
}
