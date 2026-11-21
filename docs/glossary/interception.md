# Interception

Gives the page the answer: inside the page, it finds for each request the rule that answers it
and plays the response back as the browser would have. One of Ghostfetch's bounded contexts
([Glossary Map](../../GLOSSARY-MAP.md)). A rule, its match and its switches mean here what
[Rules](rules.md) says.

## Language

**Request**:
A `fetch()` or `XMLHttpRequest` call the page makes.
_Avoid_: call, API call, hit

**Answer**:
What the page gets for a request a rule matched, in place of what the network alone would have
given it.
_Avoid_: mock (as a name for the response), stub, fake

**Mocked**:
Answered with the rule's own body, without calling the server.
_Avoid_: replaced, faked, stubbed

**Modified**:
Answered with the server's body, under the rule's status, headers or delay.
_Avoid_: patched, rewritten, overridden

**Rule error**:
A request a rule matched and couldn't answer, because the server's response it was to keep never
came. The page gets the failure it would have had without Ghostfetch.
_Avoid_: failed mock, broken rule
