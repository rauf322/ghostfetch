# Body editor

Edits, checks, formats and compares a body of text. It knows nothing of rules or requests. One
of Ghostfetch's bounded contexts ([Glossary Map](../../GLOSSARY-MAP.md)).

## Language

**Body**:
The text being edited or shown: what a rule answers with, or what a request sent or got.
_Avoid_: payload, content, document

**Mistake**:
The first place a body stops being valid JSON, with what's wrong there.
_Avoid_: error, problem, diagnostic

**Format**:
Laying a JSON body out with a value to a line, changing nothing but the blanks between its parts.
_Avoid_: prettify, beautify, reindent

**Diff**:
What changed between two texts, line by line. Under a rule's body, the two are the server's
response and the body.
_Avoid_: compare, changes view
