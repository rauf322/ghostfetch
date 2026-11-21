# Traffic

What the page asked for and what each rule did: a log of a tab's requests, kept only while its
page is open. One of Ghostfetch's bounded contexts ([Glossary Map](../../GLOSSARY-MAP.md)).
Mocked, modified and rule error mean here what [Interception](interception.md) says.

## Language

**Traffic log**:
The requests a tab's page has made, in the order it made them. It lives with the page and is
never stored.
_Avoid_: history, network log, request log

**Entry**:
One request in a traffic log: what was asked, what came back, and what a rule did to it, with the
rule's name and its group's as they were then. On screen an entry is shown as the request it
records.
_Avoid_: log line, record, event

**Recording**:
Whether requests are added to traffic logs. While it's off, Traffic shows nothing new and a rule
says nothing of what it did.
_Avoid_: logging, capturing, monitoring

**Watched page**:
The page whose traffic log the editor shows.
_Avoid_: active tab, current page, target

**Keep on reload**:
Whether a traffic log keeps its entries when its page reloads.
_Avoid_: preserve log, persist
