# Agent access (prototype)

Lets a coding agent (OpenCode, Claude Code, any MCP client) make and change your rules, and see
what your dev app asked for, so you don't have to write mocks by hand. You keep Ghostfetch's
editor open, the agent works through it, and you check the result in your app, as with a rule you
made yourself.

It's a prototype on the `prototype/agent-access` branch: the extension built from this branch, and
`ghostfetch-mcp`, the small program in `mcp/` that the agent runs.

## How it works

```text
 agent (OpenCode) ──MCP over stdio──▶ ghostfetch-mcp ──WebSocket, 127.0.0.1──▶ Ghostfetch's editor
                                       (mcp/, Node)       paired with a code     (Agent access on)
                                                                                       │
                                                                     the rules ◀───────┤
                                                                     the page's ───────┘
                                                                     requests
```

The agent starts `ghostfetch-mcp`, which waits for Ghostfetch's editor on a port of
`127.0.0.1`. The editor, with Agent access on, connects to it, and does what each of the agent's
tools asks with the extension's own code: a rule the agent saves goes into your rules as one you
made would, shows in the editor's list at once and answers on open pages straight away.

## Set it up

Once, in a checkout of the branch, with Node 24 or later:

```sh
npm install                # the extension's own packages
npm install --prefix mcp   # ghostfetch-mcp's
npm run build              # .output/chrome-mv3 and .output/firefox-mv3, with Agent access
```

Load the build in place of the Ghostfetch you use
([Build and load it](development.md#build-and-load-it)). In Chrome it's an extension of its own,
with rules of its own: turn the other one off in `chrome://extensions` while you try this one
(two would both answer the page), and bring your rules over with Export and Import. In Zen or
Firefox, the temporary add-on stands in for the installed one, which has the same ID, until the
browser restarts.

Then tell your agent how to start `ghostfetch-mcp`, with the path to this checkout:

```sh
# OpenCode, for every project (or leave out --global for this project's opencode.json)
opencode mcp add ghostfetch --global -- node /path/to/ghostfetch/mcp/ghostfetch-mcp.mjs

# Claude Code, for every project
claude mcp add --transport stdio --scope user ghostfetch -- node /path/to/ghostfetch/mcp/ghostfetch-mcp.mjs
```

Pair the editor with it, once:

1. Ask the agent for Ghostfetch's status (its `status` tool). Until an editor is connected it
   answers with a pairing code, such as `47318-ABCD-EFGH-JKMN-PQRS`.
2. Open Ghostfetch's editor (the side panel, Firefox's sidebar, or the editor in a tab), click
   **Agent** at the bottom of its sidebar (`>_`, after Export: its name shows where the sidebar
   has room for it), paste the code and click **Turn on**.

The editor remembers the code, and every editor you open connects by itself while Agent access
is on. **Turn off** in any of them turns it off in all; **Turn on** again uses the code it
remembers.

## Using it

Keep the editor open while the agent works, with your dev app open in a tab: the editor in the
side panel watches the tab beside it, the editor in a tab the web page you used last. Then ask the
agent, for example: "Make the projects list empty", "Make checkout fail with a 500", or "Mock what
the users endpoint returns, with a user on the pro plan".

A dot on the **Agent** button's `>_` says how it is: green and pulsing with an agent connected,
grey while it waits for one. Its panel names the agent and lists what it changed while the editor
was open; click one to open the rule. A rule the agent deletes can be brought back with **Undo**
in the toast, for a few seconds.

## The tools

| Tool | What it does |
| --- | --- |
| `status` | Whether an editor is connected (if not, how to connect one, with the pairing code); Ghostfetch on or paused, recording, the page the editor watches, how many rules |
| `list_rules` | Every rule in the order they're tried, with what each matches and answers with, and what it did on the page |
| `get_rule` | One rule in full, and what's wrong with it: a regex that doesn't compile, a body that isn't valid JSON, a header row the page won't get |
| `save_rule` | Makes a rule, or changes one (only the fields given), and where it goes in the list |
| `delete_rule` | Deletes a rule, and returns it as it was |
| `try_url` | Which rule would answer a request, and which others match it |
| `recent_requests` | What the page asked for, newest first, and what a rule did to each (mocked, modified, failed) or none |
| `get_request` | One of those requests with its bodies |
| `mock_request` | A rule made from one of those requests, as Traffic's **Mock this response** makes it |

`save_rule`, `delete_rule` and `mock_request` return once the change has reached the open pages,
so the next request a page makes gets the new answer. What a page loaded before the change stays
as it was until the page asks again, or you reload it.

## What the agent can and can't do

- It reads and changes every rule, as you can in the editor. It can't turn Ghostfetch or
  recording on or off, or add or remove a site: that stays in the toolbar popup.
- It sees requests only from a page on a dev host (`localhost`, `*.localhost`, `127.0.0.1`, a
  `local.*` host), and only from the page the editor watches. On any other site, what Traffic
  shows stays in the browser.
- What it reads goes to the agent, and from there to the agent's model provider: response bodies
  from your dev server included. Keep that in mind with real data behind your dev app.
- A response body is text from a server, which the agent reads as input. An agent can be steered
  by instructions hidden in it, which is one more reason the agent sees only dev hosts.

## Security

- **Off until you turn it on, in the editor.** Until then the editor connects to nothing. On, it
  connects only to `127.0.0.1`: the extension pages' CSP allows a WebSocket to `127.0.0.1` and no
  other connection, which `npm run test:release` checks.
- **Paired.** On its first run `ghostfetch-mcp` makes a token, kept in
  `~/.config/ghostfetch/agent-token` (readable by you alone), and the pairing code is its port and
  that token. An editor with another code is turned away. Delete the file to make a new token, and
  pair again.
- **Only an extension's page may connect.** `ghostfetch-mcp` turns away a WebSocket from a web
  page by its Origin, which a page in the browser can't change: a site you visit can't reach it.
- **Programs running as you are trusted**, as they are for your browser profile: one can read the
  token file, and so could pose as an agent.

## Several agents

`ghostfetch-mcp` runs once per agent session, and OpenCode starts one for each project directory
it has open. The first takes the port; the others connect to it and send their tools through it.
When it ends, another takes the port, and the editor connects to that one within a few seconds.
The editor shows the agent that asked last.

`GHOSTFETCH_AGENT_PORT` sets another port (and so another pairing code), and
`GHOSTFETCH_AGENT_TOKEN_FILE` another token file.

## Limits of the prototype

- The editor has to be open: Agent access lives in it, not in the background.
- The agent sees the requests of one page, the one the editor watches.
- Firefox lists its tabs about a second after the editor opens, so the editor's page comes that
  much later there.
- Rules only: Ghostfetch's switch, recording and the sites stay yours to change.

## For developers

- `mcp/ghostfetch-mcp.mjs`: the MCP server, with its own `package.json` (the SDK, `ws` and
  `zod`), so none of them enters the extension's packages, its lockfile or the sources zip
  (which takes only what rebuilds the extension).
- `src/pages/agent/`: the editor's side. `model/agent-connection.ts` is the connection (pairing,
  trying again while `ghostfetch-mcp` isn't there, one setting for every editor),
  `model/agent-tools.ts` what each tool does, `ui/` the panel and the **Agent** button.
- Between them, JSON over the WebSocket: the editor says `{ type: 'hello', token }` and gets
  `welcome` (with the agent's name) or `refused` and a close with code 4001. Then
  `ghostfetch-mcp` sends `{ type: 'call', id, method, params }` and the editor answers
  `{ type: 'result', id, value }` or `{ type: 'result', id, error }`. A second `ghostfetch-mcp`
  says `{ type: 'peer', token }`, with no Origin, gets `welcome-peer`, and sends its calls the
  same way.
- `npm run test:agent` builds, starts `ghostfetch-mcp` as an agent does, with the SDK's own
  client, pairs the editor through its panel in Chromium and drives every tool against the test
  server's pages. `npm run test:firefox` connects Zen's editor too.
