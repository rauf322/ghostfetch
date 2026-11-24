# The code is cut by bounded context, not by layer

Ghostfetch's code was laid out in Feature-Sliced Design's layers with pages first (`app`, `pages`,
`shared`), where only the pages are cut by what they're about. What Ghostfetch itself knows ended
up in the two layers that aren't: the scripts that answer requests in `app`, and the rules, the
sites, the traffic log and every message in `shared`, behind one door, where nothing kept them
apart, and what two pages both needed was written out in each (whether a rule is answering, in
six places). We decided to cut the code by bounded context instead, each with a glossary of its
own ([Glossary Map](../../GLOSSARY-MAP.md)): Rules and Interception, which are the core; Traffic,
Sites and Agent access, which support them; and the Body editor, which is generic. `app` stays,
as one folder for each part of the extension, and only puts contexts together. We get there in
stages, by moving and renaming working code under its tests, not by writing it again.

## Considered Options

- **Stay with the layers as they are**: nothing moves, but each new rule about rules has no one
  place to go, and the copies keep needing a test to hold them together.
- **Add Feature-Sliced Design's entities and features layers**: a rule and a site would get a
  slice each, but the cut is still by layer first, and the interceptor, which has no screen, and
  Agent access, half of which is a program outside the browser, have no layer to be in but `app`.
- **Write Ghostfetch again around the contexts**: the cleanest result on paper, and it would throw
  away what the code has learnt about XMLHttpRequest, hostile pages and each browser, which is
  most of what makes it work.

## Consequences

- Until a context's code has moved, it's still spread over `app`, `pages` and `shared`, and the
  linter still checks the layers; its rules change when the folders do.
- The glossaries are in `docs/glossary`, not beside the code they describe: Tailwind writes a
  rule for each class name it finds in any file of `src/`, and a glossary is full of words that
  are also class names.
