# The switches keep the name `enabled` where they're stored and published

The glossary says On and Off for a rule's switch and a group's, and Paused for Ghostfetch's own,
but where the switches are kept and handed on, each is a field or a key named `enabled`: in
storage, which an older version reads if it's put back; in rules files, which anyone's Ghostfetch
reads, of any version; in what the agent's tools take and return, which `ghostfetch-mcp` and an
agent's own instructions name, whatever version the extension is; and in the state the page gets,
which is the stored rules passed on. We decided to keep `enabled` there, and the glossary's words
everywhere else: on screen, in the docs and in the code's own names (`isAnswering`, `pausedStore`,
which keeps storage's `enabled` the other way up). A new name couldn't replace the old one, only
join it, since the files and the storage written before it keep `enabled`; and a version that knows
only `enabled` would find a rule's switch missing, which every version since 0.6.0 reads as on in
its editor but as off in the page: every rule would look on, and none would answer.

## Considered Options

- **Rename it everywhere, reading the old name too** (storage moved over as Ghostfetch updates,
  files and the tools taking either): the data would say what the glossary says, but `enabled`
  would still be read forever, and an older version, an older `ghostfetch-mcp` or an agent that
  knows the old name would meet one it doesn't.
- **Write both names**: every version understands what it reads, but the two can disagree once a
  hand or an older version changes only one, and every reader has to pick which one wins.
- **Rename only the page's state**, which only the bridge and the interceptor, built together,
  read: no other version meets it, but the page gets the rules as they're stored, so it would be
  the one place where a switch has a name the stored rules don't.
