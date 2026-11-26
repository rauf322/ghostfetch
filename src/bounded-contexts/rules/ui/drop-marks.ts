// Where something dragged in the rule list would land, as its data-drop says (use-rule-drag.ts): a
// line above or below a rule's row, or a group's whole block; and a group's header lit up for a
// rule that would go into the group, at its top. A line as wide as the list's rows lands among the
// list's top-level entries, out of any group; one in a group is set in as the group's rules are,
// so the end of a group and the place after it, which are at the same height, don't look alike.
import { cn } from '../../../ui/cn.ts';

export const DROP_MARK = cn(
  "data-[drop=before]:before:absolute data-[drop=before]:before:inset-x-0 data-[drop=before]:before:-top-px data-[drop=before]:before:h-0.5 data-[drop=before]:before:bg-foreground data-[drop=before]:before:content-['']",
  "data-[drop=after]:after:absolute data-[drop=after]:after:inset-x-0 data-[drop=after]:after:-bottom-px data-[drop=after]:after:h-0.5 data-[drop=after]:after:bg-foreground data-[drop=after]:after:content-['']",
);

// A rule's in a group: from under its row's dot, 36 px in, where the group's rules start.
export const GROUPED_DROP_MARK = cn(
  "data-[drop=before]:before:absolute data-[drop=before]:before:right-0 data-[drop=before]:before:left-[36px] data-[drop=before]:before:-top-px data-[drop=before]:before:h-0.5 data-[drop=before]:before:bg-foreground data-[drop=before]:before:content-['']",
  "data-[drop=after]:after:absolute data-[drop=after]:after:right-0 data-[drop=after]:after:left-[36px] data-[drop=after]:after:-bottom-px data-[drop=after]:after:h-0.5 data-[drop=after]:after:bg-foreground data-[drop=after]:after:content-['']",
);

// A block's line is as wide as the rows in it, which stand 6 px in from its edges.
export const BLOCK_MARK = cn(
  "data-[drop=before]:before:absolute data-[drop=before]:before:inset-x-1.5 data-[drop=before]:before:-top-px data-[drop=before]:before:h-0.5 data-[drop=before]:before:bg-foreground data-[drop=before]:before:content-['']",
  "data-[drop=after]:after:absolute data-[drop=after]:after:inset-x-1.5 data-[drop=after]:after:-bottom-px data-[drop=after]:after:h-0.5 data-[drop=after]:after:bg-foreground data-[drop=after]:after:content-['']",
);

export const INTO_MARK =
  'data-[drop=into]:bg-pressed data-[drop=into]:outline data-[drop=into]:-outline-offset-1 data-[drop=into]:outline-foreground';
