# Glossary Map

Ghostfetch is a browser extension for front-end developers that answers a web app's fetch and XHR
requests with rules, in place of or on top of what its server sends. Its words are kept by
bounded context ([ADR 0002](docs/adr/0002-the-code-is-cut-by-bounded-context.md)): inside a
context a word means one thing, and outside it the same word may mean another. A rule is
something you edit in Rules, a test to run in Interception, and a name on a request in Traffic.

## Contexts

- [Rules](./docs/glossary/rules.md): what Ghostfetch should answer, and which rule wins
- [Interception](./docs/glossary/interception.md): gives the page the answer, inside the page
- [Traffic](./docs/glossary/traffic.md): what the page asked for, and what each rule did
- [Sites](./docs/glossary/sites.md): where Ghostfetch runs
- [Agent access](./docs/glossary/agent-access.md): a coding agent working with the rules, through the editor
- [Body editor](./docs/glossary/body-editor.md): editing, checking and comparing a body of text

Rules and Interception are the core: what Ghostfetch is for. Traffic, Sites and Agent access
support them. The Body editor is generic: it knows nothing of rules or requests.

## Relationships

Each relationship is one of Domain-Driven Design's context-map patterns, named in italics. Where
each one's translation is in the code is in [docs/development.md](docs/development.md), under
"Files".

- **Rules → Interception** (a *shared kernel*, and Interception *conformist*): Rules gives the
  page its rules that are on, in groups that are on, in their order, each as the editor reads it,
  and says whether Ghostfetch is paused. Interception takes a rule as Rules keeps it. The two
  share one answer to which requests a rule matches and which header rows a page gets, and change
  it only together.
- **Interception → Traffic** (Traffic's *anticorruption layer*): Interception reports each request
  it saw and what a rule did to it. Traffic rebuilds every report before keeping it, as the page
  can forge one.
- **Traffic → Rules** (*customer and supplier*, Rules the customer): Rules makes a rule from an
  entry (Mock this response), keeps the server's response a rule's body is compared with, and
  shows beside each rule what it did on a page, each in its own words.
- **Rules → Traffic** (*reference by identity*): an entry keeps the id of the rule that answered,
  with its name and its group's name as they were then.
- **Sites → Interception, Traffic**: Sites decides whether anything of Ghostfetch is on a page. No
  model crosses.
- **Agent access → Rules, Traffic, Sites** (*conformist*): Agent access takes their words as they
  are, and gives an agent tools that do what the editor's user can do.
- **Agent access → a coding agent** (an *open host service*, the tools its *published
  language*): the tools' names and fields are a promise to every agent, kept from version to
  version. What an agent sends passes Rules' anticorruption layer, as a rules file does.
- **Body editor** (*generic*): shares no meaning with the others. Rules and Traffic use it as a
  library: text in, text and mistakes out.
- **What older versions, hand edits and rules files leave → Rules** (Rules' *anticorruption
  layer*): every rule and group is read as the editor reads it, each rule rebuilt field by field,
  before the screens, the badge, an agent or the page see it.
- **Between the extension's parts** (the page, the bridge, the background, the screens): each
  context's messages are its *published language*.
