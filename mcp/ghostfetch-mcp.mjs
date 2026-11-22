#!/usr/bin/env node
// ghostfetch-mcp: lets a coding agent read and change Ghostfetch's rules and see what the page the
// editor watches asked for. The agent starts it, as an MCP server over stdio. Ghostfetch's editor,
// with Agent access on, connects to it over a WebSocket on 127.0.0.1 and does what each tool asks
// with the extension's own code (src/bounded-contexts/agent-access/), so a rule the agent saves is
// in the editor's list and answers on the page at once. The editor has to be open: Chrome's side
// panel, Firefox's sidebar or a tab. See ../docs/agent-access.md.
//
// Pairing: on its first run this makes a token, kept in ~/.config/ghostfetch/agent-token (or
// GHOSTFETCH_AGENT_TOKEN_FILE), and the pairing code the user pastes into the editor is the port
// and that token. Only an extension's page may connect (the Origin the browser sends, which a web
// page can't forge), and only with the token. The port is 47318, or GHOSTFETCH_AGENT_PORT. More
// than one at once share it: see "the editors, and other copies" below.
//
// stdout is the MCP connection: anything else goes to stderr.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { WebSocket, WebSocketServer } from 'ws';
import * as z from 'zod/v4';

const VERSION = '0.2.0';
const PORT = Number(process.env.GHOSTFETCH_AGENT_PORT) || 47318;
const TOKEN_FILE =
  process.env.GHOSTFETCH_AGENT_TOKEN_FILE ||
  path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
    'ghostfetch',
    'agent-token',
  );
// How long a tool waits for an editor to connect (it tries every few seconds), and for its answer.
const WAIT_FOR_EDITOR = 6000;
const WAIT_FOR_ANSWER = 20000;

const log = (...args) => console.error('ghostfetch-mcp:', ...args);

// ------------------------------------------------------------ pairing

// No 0/O or 1/I/L, so the code reads back as it's written.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// The token from its file, or a new one, written so only you can read it. Two servers starting at
// once write it once (wx): the second reads the first's.
function readToken() {
  try {
    const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    if (/^[A-Z2-9]{16}$/.test(token)) return token;
  } catch {
    // None yet.
  }
  const token = Array.from(
    { length: 16 },
    () => ALPHABET[crypto.randomInt(ALPHABET.length)],
  ).join('');
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true, mode: 0o700 });
  try {
    fs.writeFileSync(TOKEN_FILE, `${token}\n`, { mode: 0o600, flag: 'wx' });
    return token;
  } catch (error) {
    if (error.code === 'EEXIST') return readToken();
    throw error;
  }
}
const TOKEN = readToken();
const PAIRING_CODE = `${PORT}-${TOKEN.match(/.{4}/g).join('-')}`;

const sameToken = (token) =>
  typeof token === 'string' &&
  token.length === TOKEN.length &&
  crypto.timingSafeEqual(Buffer.from(token), Buffer.from(TOKEN));

const notConnected = () =>
  [
    "Ghostfetch isn't connected. Ask the user to open Ghostfetch's editor (its side panel, Firefox's sidebar, or the editor in a tab), click Agent at the bottom of its sidebar, paste this pairing code and click Turn on:",
    '',
    `    ${PAIRING_CODE}`,
    '',
    'They do this once: the editor remembers the code. It has to stay open while you work.',
  ].join('\n');

// ------------------------------------------------------------ the editors, and other copies

// More than one ghostfetch-mcp runs at once: one per agent session, and OpenCode starts one for
// each project directory it has open. The first listens on the port (the leader); any other finds
// the port taken, connects to the leader as a peer and sends its tools through it. When the leader
// ends, a peer takes the port, and the editors, which try again every few seconds, connect to it.
// A peer proves it's one with the token, which it reads from the same file; it connects with no
// Origin, which no page in a browser can do.

// Paired editors, the newest last: a tool goes to the newest. (Every open editor shares the same
// rules, and each watches its own page.)
const editors = [];
// Tools waiting for an editor to connect.
let waiting = [];
// Calls sent to an editor, or as a peer to the leader, not answered yet, by id.
const pending = new Map();
let calls = 0;
// The leader, while this is a peer.
let leader = null;
// Why tools can't be done, while they can't: the port is taken by some other program.
let listenError = '';

class ToolError extends Error {}

function agentName() {
  const client = server.server.getClientVersion();
  return client ? client.title || client.name : '';
}

function send(socket, message) {
  socket.send(JSON.stringify(message));
}

// What came back for a call this sent.
function answered(socket, message) {
  const asked = pending.get(message.id);
  if (!asked || asked.socket !== socket) return;
  pending.delete(message.id);
  clearTimeout(asked.timer);
  if (typeof message.error === 'string') asked.reject(new ToolError(message.error));
  else asked.resolve(message.value);
}

// The calls sent on a socket that closed, which won't be answered.
function dropped(socket, why) {
  for (const [id, asked] of pending) {
    if (asked.socket !== socket) continue;
    pending.delete(id);
    clearTimeout(asked.timer);
    asked.reject(new ToolError(why));
  }
}

// An editor, or a peer, connecting to this leader.
function onConnection(socket, request) {
  let role = '';
  // It has a moment to say who it is, with the token.
  const timer = setTimeout(() => socket.close(4000, 'No hello'), 5000);
  socket.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(String(data));
    } catch {
      socket.close(1003, 'Not JSON');
      return;
    }
    if (!role) {
      clearTimeout(timer);
      const peer = message?.type === 'peer' && request.headers.origin === undefined;
      if ((message?.type !== 'hello' && !peer) || !sameToken(message.token)) {
        send(socket, { type: 'refused', reason: 'code' });
        socket.close(4001, 'Wrong pairing code');
        return;
      }
      role = peer ? 'peer' : 'editor';
      if (peer) {
        send(socket, { type: 'welcome-peer' });
        log('another ghostfetch-mcp joined');
        return;
      }
      const editor = { socket, client: message.client };
      editors.push(editor);
      send(socket, {
        type: 'welcome',
        server: { name: 'ghostfetch-mcp', version: VERSION },
        agent: agentName(),
      });
      log('an editor connected');
      for (const resolve of waiting.splice(0)) resolve(editor);
      return;
    }
    // A peer's tool, done here and answered there.
    if (role === 'peer' && message?.type === 'call') {
      call(message.method, message.params, message.wait, message.agent).then(
        (value) => send(socket, { type: 'result', id: message.id, value }),
        (error) => send(socket, { type: 'result', id: message.id, error: error.message }),
      );
      return;
    }
    if (role === 'editor' && message?.type === 'result') answered(socket, message);
  });
  socket.on('close', () => {
    clearTimeout(timer);
    const index = editors.findIndex((editor) => editor.socket === socket);
    if (index !== -1) {
      editors.splice(index, 1);
      log('an editor went away');
    }
    dropped(socket, 'The editor closed before it answered.');
  });
}

// Takes the port, on 127.0.0.1 only; or, taken, joins the ghostfetch-mcp that has it.
function listen() {
  const sockets = new WebSocketServer({
    host: '127.0.0.1',
    port: PORT,
    // A rule's body, or a request's, can be a few megabytes.
    maxPayload: 32 * 1024 * 1024,
    // An extension's page (a page in the browser can't send another Origin), or a peer (none).
    verifyClient: ({ origin }) =>
      origin === undefined || /^(chrome|moz)-extension:\/\/[\w-]+$/.test(origin),
  });
  sockets.on('listening', () => {
    listenError = '';
    log(`listening on 127.0.0.1:${PORT}`);
  });
  sockets.on('connection', onConnection);
  sockets.on('error', (error) => {
    sockets.close();
    if (error.code === 'EADDRINUSE') {
      join();
      return;
    }
    listenError = `ghostfetch-mcp can't listen on 127.0.0.1:${PORT}: ${error.message}`;
    log(listenError);
    setTimeout(listen, 3000);
  });
}

// Joins the leader as a peer. Gone, it tries to take the port, a moment later (each peer a
// different moment, so one does, and the others join it).
function join() {
  const socket = new WebSocket(`ws://127.0.0.1:${PORT}/`, {
    maxPayload: 32 * 1024 * 1024,
  });
  let joined = false;
  socket.on('open', () => send(socket, { type: 'peer', token: TOKEN }));
  socket.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }
    if (message?.type === 'welcome-peer') {
      joined = true;
      leader = socket;
      listenError = '';
      log(`working through the ghostfetch-mcp on port ${PORT}`);
    } else if (message?.type === 'result') answered(socket, message);
  });
  // (A close follows.)
  socket.on('error', () => {});
  socket.on('close', () => {
    if (leader === socket) leader = null;
    dropped(
      socket,
      'The ghostfetch-mcp this one works through ended before it answered: try again.',
    );
    if (!joined) {
      listenError = `Port ${PORT} is taken by another program: set GHOSTFETCH_AGENT_PORT to a free one, and pair the editor with the code that gives.`;
      log(listenError);
    }
    setTimeout(listen, joined ? 200 + Math.random() * 800 : 3000);
  });
}

function waitForEditor(ms) {
  if (editors.length) return Promise.resolve(editors.at(-1));
  return new Promise((resolve) => {
    const done = (editor) => {
      clearTimeout(timer);
      resolve(editor);
    };
    const timer = setTimeout(() => {
      waiting = waiting.filter((other) => other !== done);
      resolve(null);
    }, ms);
    waiting.push(done);
  });
}

// Does what a tool does: asks the newest editor and returns what it answers, or as a peer has the
// leader do that. `agent` names the agent that asked, which the editor shows.
async function call(method, params, wait = WAIT_FOR_EDITOR, agent = agentName()) {
  if (listenError) throw new ToolError(listenError);
  let socket = leader;
  if (!socket) {
    const editor = await waitForEditor(wait);
    if (!editor) throw new ToolError(notConnected());
    ({ socket } = editor);
  }
  const id = ++calls;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => {
        pending.delete(id);
        reject(new ToolError("Ghostfetch's editor didn't answer in time."));
      },
      // Through the leader, which waits for an editor too.
      (socket === leader ? wait : 0) + WAIT_FOR_ANSWER,
    );
    pending.set(id, { resolve, reject, timer, socket });
    send(socket, { type: 'call', id, method, params, wait, agent });
  });
}

// ------------------------------------------------------------ the tools

const server = new McpServer(
  { name: 'ghostfetch', version: VERSION },
  {
    instructions: [
      'Ghostfetch is a browser extension that mocks and changes the responses a web page gets from fetch() and XMLHttpRequest, by rules, on the pages it runs on: localhost, *.localhost, 127.0.0.1, local.* hosts and sites the user added.',
      'These tools read and change its rules through its editor, which the user keeps open, and show what the page the editor watches asked for (only for localhost, *.localhost, 127.0.0.1 and local.* pages).',
      'Rules are tried in one order, top to bottom: the first that matches a request and is answering (on, in no group or a group that is on) answers it. A group is a named block of rules in that order, one level deep, with a switch of its own: turned off, none of its rules answer, each keeping its own switch. Group names are unique.',
      "Users keep a group per branch or PR they work on. Put the rules you make in the group for the work at hand (group on save_rule and mock_request): one of the user's that fits (list_rules has them), or, if none does, ask the user or make one named after the branch.",
      'Start with status. A rule applies at once: reload the page for requests it already made. To mock what the app really gets, find the request with recent_requests and use mock_request, then change the rule with save_rule.',
    ].join(' '),
  },
);

// What a rule is, for the tools that take one.
const METHODS = ['ANY', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
const match = z
  .object({
    url: z
      .string()
      .optional()
      .describe(
        "The pattern a request's full URL is compared with, by mode. Empty matches nothing, unless graphqlOperation is set.",
      ),
    mode: z
      .enum(['contains', 'equals', 'wildcard', 'regex'])
      .optional()
      .describe(
        'contains (the default): the URL contains the pattern. equals: the whole URL, or its path and query when the pattern starts with /. wildcard: * stands for anything, the whole URL must match. regex: a JavaScript regular expression tested against the full URL.',
      ),
    method: z.enum(METHODS).optional().describe('ANY (the default) or one method.'),
    graphqlOperation: z
      .string()
      .optional()
      .describe(
        "A GraphQL operation name the request must have (its body's operationName or query name, or the URL's operationName).",
      ),
  })
  .describe('Which requests the rule answers. Only the fields given change.');
const response = z
  .object({
    bodyMode: z
      .enum(['replace', 'original'])
      .optional()
      .describe(
        'replace (the default): answer with body, without calling the server. original: call the server and keep its body; status, headers and delay still apply.',
      ),
    body: z
      .unknown()
      .optional()
      .describe(
        'The body for replace: a string, or any JSON value, which is saved pretty-printed.',
      ),
    status: z
      .union([z.string().regex(/^\d{0,3}$/), z.number().int().min(100).max(999)])
      .optional()
      .describe("The status code: '' for 200 (replace) or the server's own (original)."),
    contentType: z
      .string()
      .optional()
      .describe('The Content-Type, application/json unless set.'),
    delay: z
      .number()
      .int()
      .min(0)
      .max(600000)
      .optional()
      .describe('How long to hold the response back, in ms.'),
    headers: z
      .array(
        z.object({
          op: z
            .enum(['set', 'remove'])
            .optional()
            .describe('set (the default) or remove'),
          name: z.string(),
          value: z.string().optional(),
        }),
      )
      .optional()
      .describe(
        "Response header rows, which replace the rule's. A page never sees Set-Cookie.",
      ),
  })
  .describe('What the rule answers with. Only the fields given change.');

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const writes = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

function tool(name, { title, description, input = {}, annotations = readOnly }) {
  server.registerTool(
    name,
    { title, description, inputSchema: z.object(input), annotations },
    async (args) => {
      try {
        const value = await call(name, args);
        return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
      } catch (error) {
        if (!(error instanceof ToolError)) log(error);
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    },
  );
}

// Answers without an editor too: whether one is connected, and how to connect one.
server.registerTool(
  'status',
  {
    title: "Ghostfetch's status",
    description:
      "Whether Ghostfetch's editor is connected, and if so: Ghostfetch on or off, recording, how many rules there are (on, and answering: on, in a group that's on), how many groups (and on), and the page the editor watches. A dev page (localhost, *.localhost, 127.0.0.1, local.*) comes with its URL and title, and logConnected: whether its requests are arriving yet (for a moment after the editor picks a page, they aren't). Any other page is only devHost: false, its address and requests staying in the browser. If it isn't connected, says how the user connects it, with the pairing code.",
    inputSchema: z.object({}),
    annotations: readOnly,
  },
  async () => {
    try {
      const value = await call('status', {}, 2000);
      return {
        content: [
          { type: 'text', text: JSON.stringify({ connected: true, ...value }, null, 2) },
        ],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: error.message }] };
    }
  },
);

tool('list_rules', {
  title: 'List rules',
  description:
    "Every rule, in the order they're tried: the first that matches a request and is answering (on, in no group or a group that's on) answers it. Each with its position in that order, id, name, group, whether it's on and whether it's answering, what it matches, what it answers with, and what it did on the page the editor watches. And every group: id, name, whether it's on, its position among the list's top-level entries (groups and ungrouped rules, 0 the top), and how many rules it has and has on.",
  input: {
    query: z
      .string()
      .optional()
      .describe("Only rules whose name, URL pattern or group's name contains this."),
  },
});

tool('get_rule', {
  title: 'Get a rule',
  description:
    "One rule as Ghostfetch keeps it, body and headers included, with anything wrong with it (a body that isn't valid JSON, a regex that doesn't compile, a header the page won't get).",
  input: { id: z.string() },
});

// A rule's group, for the tools that put one in a group.
const group = z
  .string()
  .optional()
  .describe(
    "The group to put the rule in, by its name (or id). A name no group has makes a new group, at the top of the list, on. '' takes the rule out of its group.",
  );

tool('save_rule', {
  title: 'Create or change a rule',
  description:
    "Creates a rule, or with an id changes that rule: only the fields given change. A new rule goes first in its group, or in the list if it's in none (so it wins over the others there), unless position says otherwise. Returns once the change has reached the open pages, so the next request a page makes gets it; what a page loaded before stays as it was until the page asks again or reloads. Returns the rule, its group, and anything wrong with it (off, its group off).",
  input: {
    id: z.string().optional().describe('The rule to change. Leave it out to create one.'),
    name: z.string().optional(),
    enabled: z.boolean().optional().describe('Whether the rule is on (its own switch).'),
    group: group.describe(
      "The group to put the rule in, by its name (or id). A name no group has makes a new group, at the top of the list, on. '' takes the rule out of its group. Left out: a change keeps the rule where it is, a new rule goes in no group.",
    ),
    position: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Where it's tried in the whole order, from 0, the first: in a group, as near to that as the group's block allows.",
      ),
    match: match.optional(),
    response: response.optional(),
  },
  annotations: writes,
});

tool('delete_rule', {
  title: 'Delete a rule',
  description:
    'Deletes a rule. Returns it as it was, so it can be saved again; the user can also undo it in the editor for a few seconds.',
  input: { id: z.string() },
  annotations: { ...writes, destructiveHint: true },
});

tool('save_group', {
  title: 'Create or change a group',
  description:
    "Creates a group, or changes one (by id, or by name when no id is given): renames it, turns it on or off (off, none of its rules answer, each keeping its own switch), or moves it with its rules. A new group goes at the top of the list, on, unless position or enabled say otherwise; with copyOf it starts as a copy of that group's rules. Returns once the change has reached the open pages.",
  input: {
    id: z.string().optional().describe('The group to change.'),
    name: z
      .string()
      .optional()
      .describe(
        "The group's name: with an id, its new name; without, the group to change, or the one to create if no group has it. Names are unique, ignoring case.",
      ),
    enabled: z.boolean().optional().describe('Whether the group is on.'),
    position: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Where it goes among the list's top-level entries (groups and ungrouped rules), from 0, the top: a group higher up wins where its rules and another's match the same request.",
      ),
    copyOf: z
      .string()
      .optional()
      .describe(
        'Only for a new group: the group (by name or id) whose rules it starts with, copied with their switches.',
      ),
  },
  annotations: writes,
});

tool('delete_group', {
  title: 'Delete a group',
  description:
    'Deletes a group and its rules. Returns them as they were; the user can also undo it in the editor for a few seconds. To keep the rules, take them out of the group first (save_rule with group "").',
  input: {
    id: z.string().optional(),
    name: z.string().optional().describe('The group, by name, when no id is given.'),
  },
  annotations: { ...writes, destructiveHint: true },
});

tool('try_url', {
  title: 'Which rule answers a request',
  description:
    "Which rule would answer a request, as the page decides: the first that matches it and is on, in no group or a group that's on. Also lists the other rules that match (off, in a group that's off, or further down), each with its group. A URL starting with / is taken as on the page the editor watches.",
  input: {
    url: z.string(),
    method: z.enum(METHODS.slice(1)).optional().describe('GET unless given.'),
    body: z.string().optional().describe('The request body, for a GraphQL operation.'),
  },
});

tool('recent_requests', {
  title: 'Recent requests',
  description:
    "The requests the page the editor watches made, newest first: method, URL, status, and what a rule did (mocked, modified, error) or none. Only for a page on localhost, *.localhost, 127.0.0.1 or a local.* host, and only while Ghostfetch records (the toolbar popup's Recording). Bodies with get_request.",
  input: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('How many, 30 unless given.'),
    url: z.string().optional().describe('Only requests whose URL contains this.'),
    action: z
      .enum(['mocked', 'modified', 'error', 'none'])
      .optional()
      .describe('Only requests a rule mocked, modified or failed on, or none answered.'),
  },
});

tool('get_request', {
  title: 'A request in full',
  description:
    'One request from recent_requests with its request and response bodies (the log keeps the first 1 MB of each).',
  input: {
    id: z.string(),
    maxBody: z
      .number()
      .int()
      .min(0)
      .max(1_000_000)
      .optional()
      .describe('Characters of each body to return, 20000 unless given.'),
  },
});

tool('mock_request', {
  title: 'Mock a request',
  description:
    "Makes a rule from a request in recent_requests, as Traffic's Mock this response does: it matches the request's method and path (for GraphQL, its operation) and answers with its status and body. The rule goes first in its group, or in the list if it's in none; change it with save_rule.",
  input: {
    id: z.string(),
    name: z.string().optional(),
    group,
  },
  annotations: writes,
});

// ------------------------------------------------------------ start

listen();
// The agent ended the session, closing its end of stdio: so does this, WebSocket server and all.
process.stdin.on('end', () => process.exit(0));
await server.connect(new StdioServerTransport());
log(`pairing code ${PAIRING_CODE}`);
