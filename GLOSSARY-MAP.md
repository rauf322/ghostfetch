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

- **Rules → Interception**: Rules gives the page its rules that are on, in groups that are on, in
  their order, and says whether Ghostfetch is paused. Interception takes a rule as Rules keeps it.
  The two share one answer to which requests a rule matches and which header rows a page gets.
- **Interception → Traffic**: Interception reports each request it saw and what a rule did to it.
  Traffic rebuilds every report before keeping it, as the page can forge one.
- **Traffic → Rules**: Rules makes a rule from an entry (Mock this response), keeps the server's
  response a rule's body is compared with, and shows beside each rule what it did on a page.
- **Rules → Traffic**: an entry keeps the id of the rule that answered, with its name and its
  group's name as they were then.
- **Sites → Interception, Traffic**: Sites decides whether anything of Ghostfetch is on a page.
- **Agent access → Rules, Traffic, Sites**: Agent access takes their words as they are, and gives
  an agent tools that do what the editor's user can do.
- **Body editor**: shares no meaning with the others. Rules and Traffic show bodies with it.
