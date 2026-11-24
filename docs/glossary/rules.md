# Rules

What Ghostfetch should answer, and which rule wins: the rules, their groups, the order they're
tried in and their switches. One of Ghostfetch's bounded contexts
([Glossary Map](../../GLOSSARY-MAP.md)).

## Language

### Rules and their order

**Rule**:
A pattern for requests (URL, method, GraphQL operation) and the answer Ghostfetch gives the
requests it matches: a body of its own, or the server's body with another status, headers or delay.
_Avoid_: mock (as the name of the rule itself), route, handler

**Group**:
A named set of rules with an on/off switch of its own, which sits in the order as one block. One
level only: a group holds rules, never another group; and no two groups share a name.
_Avoid_: folder, subfolder, collection, set, profile, scenario

**Ungrouped rule**:
A rule in no group.
_Avoid_: loose rule, top-level rule, default group

**Order**:
The one top-to-bottom sequence in which the rules are tried, a group's rules together in its place.
Of the rules that match a request, the highest one that's on, in a group that's on, answers it.
_Avoid_: priority (as a setting of its own), recency, "the newest wins"

### Switches

**On / Off**:
The switch every rule and every group has. A rule answers only while it and its group are both on;
turning a group off leaves its rules' own switches as they were, for when it's turned on again.
_Avoid_: active, inactive, enabled, disabled

**Answering**:
The state of a rule that's on, in no group or a group that's on, while Ghostfetch isn't paused:
only an answering rule answers the requests it matches. A rule that's on but not answering is
waiting for its group, or for Ghostfetch.
_Avoid_: live, in effect, effectively on

**Paused**:
Ghostfetch as a whole turned off: no rule answers, whatever its switches say.
_Avoid_: off (for the whole extension), disabled
