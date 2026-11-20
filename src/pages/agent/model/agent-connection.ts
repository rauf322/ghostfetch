// Agent access: the editor's connection to ghostfetch-mcp (mcp/ghostfetch-mcp.mjs), which a coding
// agent starts. While it's on, the editor connects to it on 127.0.0.1, says hello with the token
// from the pairing code, then does what the agent's tools ask (agent-tools.ts) and answers. While
// ghostfetch-mcp isn't there (the agent's session hasn't started, or has ended) it tries again every
// few seconds; with a code ghostfetch-mcp turns down, it stops until another is pasted. Every open
// editor connects, and ghostfetch-mcp asks the newest. Whether it's on, and the code, are one
// setting for every editor, remembered in this browser: turned off in one, it's off in all.
import { createStore } from '../../../shared/lib/index.ts';
import { pairingCode, parsePairingCode } from '../lib/pairing-code.ts';

export type AgentStatus = 'off' | 'waiting' | 'connected' | 'refused';

export interface AgentActivity {
  id: number;
  time: number;
  // What the agent did, in words: Created “Users list”.
  text: string;
  // The rule it did it to, to open it; null for one it deleted.
  ruleId: string | null;
}

interface AgentState {
  status: AgentStatus;
  // The pairing code, kept while it's off too, so turning it on again takes a click.
  code: string;
  // The agent, as it named itself to ghostfetch-mcp (opencode, claude-code), once it has.
  agent: string;
  // What the agent did while this editor was open, newest first.
  activity: AgentActivity[];
}

// What a tool asks of the editor: its name and what the agent gave it. Returns what goes back, or
// a promise of it (a change, once it's on the open pages).
export type AgentHandler = (method: string, params: unknown) => unknown;

const KEY = 'ghostfetch.agent';
const MAX_ACTIVITY = 30;

const state: AgentState = { status: 'off', code: '', agent: '', activity: [] };
export const agentStore = /* @__PURE__ */ createStore<AgentState>(state);

let handler: AgentHandler | null = null;
let client: Record<string, string> = {};
let socket: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let attempts = 0;
let activities = 0;

function update(next: Partial<AgentState>) {
  Object.assign(state, next);
  agentStore.emit();
}

// What's remembered: the code, and whether it's on.
function stored(): { code: string; on: boolean } {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    const code = typeof value?.code === 'string' ? value.code : '';
    return { code, on: value?.on === true && Boolean(parsePairingCode(code)) };
  } catch {
    return { code: '', on: false };
  }
}

function remember(code: string, on: boolean) {
  localStorage.setItem(KEY, JSON.stringify({ code, on }));
}

function disconnect() {
  clearTimeout(retry);
  retry = undefined;
  const open = socket;
  socket = null;
  open?.close();
}

function connect() {
  disconnect();
  const pairing = parsePairingCode(state.code);
  if (!handler || !pairing) return;
  const opened = new WebSocket(`ws://127.0.0.1:${pairing.port}/`);
  socket = opened;
  opened.addEventListener('open', () =>
    opened.send(JSON.stringify({ type: 'hello', token: pairing.token, client })),
  );
  opened.addEventListener('message', (event) => {
    if (opened === socket) receive(opened, event.data);
  });
  opened.addEventListener('close', (event) => {
    if (opened !== socket) return;
    socket = null;
    // 4001: ghostfetch-mcp turned the code down.
    if (event.code === 4001) {
      update({ status: 'refused', agent: '' });
      return;
    }
    update({ status: 'waiting', agent: '' });
    attempts += 1;
    retry = setTimeout(connect, Math.min(1000 * attempts, 5000));
  });
}

async function receive(opened: WebSocket, data: unknown) {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(String(data));
  } catch {
    return;
  }
  // The agent's name comes with the welcome and with every call: an agent that hadn't introduced
  // itself yet as the editor connected has by its first call.
  const agent = typeof message.agent === 'string' ? message.agent : '';
  if (message.type === 'welcome') {
    attempts = 0;
    update({ status: 'connected', agent });
    return;
  }
  if (
    message.type !== 'call' ||
    typeof message.id !== 'number' ||
    typeof message.method !== 'string' ||
    !handler
  )
    return;
  if (agent && agent !== state.agent) update({ agent });
  let reply;
  try {
    reply = {
      type: 'result',
      id: message.id,
      value: await handler(message.method, message.params ?? {}),
    };
  } catch (error) {
    reply = { type: 'result', id: message.id, error: (error as Error).message };
  }
  if (opened.readyState === WebSocket.OPEN) opened.send(JSON.stringify(reply));
}

// Another editor turned it on or off, or paired it again.
function onStorage(event: StorageEvent) {
  if (event.key !== KEY && event.key !== null) return;
  const { code, on } = stored();
  if (code === state.code && on === (state.status !== 'off')) return;
  if (!on) {
    disconnect();
    update({ status: 'off', code, agent: '' });
    return;
  }
  attempts = 0;
  update({ status: 'waiting', code, agent: '' });
  connect();
}

// The editor's part: starts the connection if it's on, with `handle` doing what the tools ask and
// `about` saying which editor this is. Returns what stops it, as the editor closes.
export function startAgentAccess(handle: AgentHandler, about: Record<string, string>) {
  handler = handle;
  client = about;
  const { code, on } = stored();
  attempts = 0;
  update({ code, status: on ? 'waiting' : 'off', agent: '' });
  if (on) connect();
  window.addEventListener('storage', onStorage);
  return () => {
    handler = null;
    window.removeEventListener('storage', onStorage);
    disconnect();
  };
}

// Turn on, with a pasted code (or the one remembered): false if it isn't a pairing code.
export function turnOnAgent(text: string) {
  const pairing = parsePairingCode(text);
  if (!pairing) return false;
  const code = pairingCode(pairing);
  remember(code, true);
  attempts = 0;
  update({ code, status: 'waiting', agent: '' });
  connect();
  return true;
}

export function turnOffAgent() {
  remember(state.code, false);
  disconnect();
  update({ status: 'off', agent: '' });
}

export function noteActivity(text: string, ruleId: string | null) {
  update({
    activity: [
      { id: ++activities, time: Date.now(), text, ruleId },
      ...state.activity,
    ].slice(0, MAX_ACTIVITY),
  });
}
