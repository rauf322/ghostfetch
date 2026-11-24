# Agent access

Lets a coding agent work with the rules and see what a dev page asked for, through the editor,
once the user has turned it on. One of Ghostfetch's bounded contexts
([Glossary Map](../../GLOSSARY-MAP.md)). Rule, group and order mean here what
[Rules](rules.md) says, and entry what [Traffic](traffic.md) says.

## Language

**Agent**:
A coding agent working for the user, such as OpenCode or Claude Code.
_Avoid_: bot, AI, assistant, client

**Agent access**:
The switch that lets an agent work through the editor. It's off until the user turns it on.
_Avoid_: remote control, API access, integration

**ghostfetch-mcp**:
The small program an agent runs to reach the editor.
_Avoid_: server, backend, daemon

**Pairing code**:
What ghostfetch-mcp gives and the user pastes into the editor once, after which the two trust
each other.
_Avoid_: token (the secret inside it), key, password

**Tool**:
One thing an agent can ask the editor to do or to tell it.
_Avoid_: command, endpoint, action

**Dev host**:
A host whose pages' requests an agent may see: localhost, any name under .localhost, 127.0.0.1,
and any name that starts with "local." and a letter or a digit. Requests from any other page stay
in the browser.
_Avoid_: built-in host (Sites' word, for what are today the same hosts)
