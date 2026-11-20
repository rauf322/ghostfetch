# The order decides which rule answers, not recency

With groups, rules from two PRs can match the same request, so something has to decide which one
answers. We decided the order does, as it already does for single rules: of the rules that match,
the highest in the list answers (a group's rules together in its place, groups and ungrouped rules
in whatever order they're dragged into), not the newest, the one edited last, or the group turned
on last. "The newest wins" is only the usual result, because what's new goes to the top of where it
lands; we kept position because the list then shows which rule will answer, which any order by
time would hide.

## Considered Options

- **The group turned on last wins** (turning a group on moves it to the top): the order stays
  visible, but clicking a dot rearranges the editor's list and the popup's.
- **The rule edited last wins** (ordered by time, with no dragging): the winner can't be seen from
  the list, and editing an old rule silently changes which one answers.
