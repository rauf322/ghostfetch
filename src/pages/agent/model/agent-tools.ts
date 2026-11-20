// What the agent's tools (mcp/ghostfetch-mcp.mjs) do, here in the editor, with the editor's own
// code: the rules as shared/api keeps them (which saves them, sends them to open pages and redraws
// the screens), and the log of the page the editor watches. What a tool is given is checked here
// again, and a rule is rebuilt by normalizeRule before it's kept, as an imported one is. The
// agent sees requests only from a page on a dev host (localhost, *.localhost, 127.0.0.1, local.*):
// what the editor watches on any other site stays in the browser.
import {
  addRule,
  countRule,
  countWords,
  createRule,
  editRule,
  entryTester,
  findRule,
  fromServer,
  isBuiltInHost,
  keepServerResponse,
  moveRule,
  normalizeRule,
  removeRule,
  responseFromEntry,
  ruleFromEntry,
  ruleStore,
  ruleTitle,
  settingsStore,
  siteOf,
} from '../../../shared/api/index.ts';
import type { LogEntry, Rule, TrafficLog } from '../../../shared/api/index.ts';
import { notify } from '../../../shared/ui/kit/toast.tsx';
import { ruleProblems, ruleSummary } from '../lib/rule-report.ts';
import { noteActivity } from './agent-connection.ts';

type Params = Record<string, unknown>;

const isObject = (value: unknown): value is Params =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// The fields of a rule a tool gave, as the rule keeps them: a body that isn't a string is JSON,
// pretty-printed; a status given as a number is text. normalizeRule checks the rest.
function ruleFields(params: Params) {
  const top: Params = {};
  if (params.name !== undefined) top.name = String(params.name);
  if (params.enabled !== undefined) top.enabled = params.enabled === true;
  const pick = (from: unknown, keys: string[]) => {
    const picked: Params = {};
    if (isObject(from))
      for (const key of keys) if (from[key] !== undefined) picked[key] = from[key];
    return picked;
  };
  const match = pick(params.match, ['url', 'mode', 'method', 'graphqlOperation']);
  const response = pick(params.response, [
    'bodyMode',
    'body',
    'status',
    'contentType',
    'delay',
    'headers',
  ]);
  if (response.body !== undefined && typeof response.body !== 'string')
    response.body = JSON.stringify(response.body, null, 2);
  if (typeof response.status === 'number') response.status = String(response.status);
  return { top, match, response };
}

// The path and query of a URL, as a request is named in the activity list.
function pathOf(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

// Once a change to the rules is written, and a moment more for each open page's bridge to hear of
// it and hand the rules in, so a request the agent has the page make next is answered by them: in
// Firefox the rules reach the page about 20 ms after the write. (A read waits for the write before
// it, which the change made at once.)
async function rulesApplied() {
  await chrome.storage.local.get('rulesWriter');
  await new Promise((resolve) => setTimeout(resolve, 100));
}

// A request in recent_requests: what it was and what became of it, without its bodies.
function requestSummary(entry: LogEntry) {
  return {
    id: entry.id,
    time: new Date(entry.time).toISOString(),
    kind: entry.kind,
    method: entry.method,
    url: entry.url,
    status: entry.status,
    durationMs: entry.duration === null ? null : Math.round(entry.duration),
    rule: entry.ruleId
      ? { id: entry.ruleId, name: entry.ruleName, did: entry.action || 'nothing' }
      : null,
    error: entry.error || undefined,
    frame: entry.frame || undefined,
    requestBodyLength: entry.requestBody.length,
    responseBodyLength: entry.responseBody.length,
    truncated: entry.truncated || undefined,
  };
}

export function createAgentTools({ log, place }: { log: TrafficLog; place: string }) {
  const rules = () => ruleStore.state.rules;
  const positionOf = (id: string) => rules().findIndex((rule) => rule.id === id);

  // The page the editor watches, or null with none: for the editor's own use.
  function watched() {
    const { target, targetUrl, connected } = log.snapshot();
    const url = targetUrl || target?.url || '';
    if (!url) return null;
    return {
      url,
      title: target?.title ?? '',
      devHost: isBuiltInHost(siteOf(url)),
      connected,
    };
  }

  // The page as the agent hears of it: a dev page in full; any other only as not being one, its
  // address and title staying in the browser, as its requests do.
  function page() {
    const seen = watched();
    if (!seen) return null;
    if (!seen.devHost) return { devHost: false };
    return {
      url: seen.url,
      title: seen.title,
      devHost: true,
      // The page's log has reached the editor, so its requests are listed as they're made. Not
      // yet, for a moment after the editor picks a page with a long log; never, on a page that
      // loaded before Ghostfetch did.
      logConnected: seen.connected,
    };
  }

  // The page, if the agent may see its requests.
  function devPage() {
    const seen = watched();
    if (!seen)
      throw new Error(
        "The editor isn't watching a page: open the app in a tab of the editor's window.",
      );
    if (!seen.devHost)
      throw new Error(
        "The editor is watching a page that isn't on localhost, *.localhost, 127.0.0.1 or a local.* host, so its requests stay in the browser. Open the dev app (or pick it in Traffic's page picker).",
      );
    return seen;
  }

  function ruleById(id: unknown) {
    const found = typeof id === 'string' ? findRule(id) : undefined;
    if (!found)
      throw new Error(`No rule has the id ${JSON.stringify(id)}: list_rules has them.`);
    return found;
  }

  function entryById(id: unknown) {
    devPage();
    const found = log.snapshot().entries.find((entry) => entry.id === id);
    if (!found)
      throw new Error(
        `No request has the id ${JSON.stringify(id)} in the log, which keeps the newest 500: recent_requests has them.`,
      );
    return found;
  }

  // What the page the editor watches saw each rule do, if the agent may see it.
  function didHere() {
    const entries = watched()?.devHost ? log.snapshot().entries : [];
    return (id: string) => countWords(countRule(entries, id));
  }

  // A rule after a change: where it is, and what keeps it from answering.
  function report(rule: Rule) {
    const problems = ruleProblems(rule);
    if (!rule.enabled)
      problems.push("It's off, so it answers nothing until it's turned on.");
    if (!settingsStore.state.enabled)
      problems.push(
        "Ghostfetch is paused (its toolbar popup), so no rule answers until it's resumed.",
      );
    return { rule, position: positionOf(rule.id), problems };
  }

  // Moves a rule to `position` in the list (0, the first, is tried first).
  function moveTo(id: string, position: unknown) {
    if (typeof position !== 'number' || !Number.isInteger(position)) return;
    const to = Math.min(Math.max(position, 0), rules().length - 1);
    const from = positionOf(id);
    if (from !== to) moveRule(id, from < to ? to + 1 : to);
  }

  return {
    status() {
      const { enabled, record } = settingsStore.state;
      return {
        ghostfetch: {
          version: chrome.runtime.getManifest().version,
          on: enabled,
          recording: record,
        },
        editor: place,
        page: page(),
        rules: {
          total: rules().length,
          on: rules().filter((rule) => rule.enabled).length,
        },
      };
    },

    list_rules({ query }: Params) {
      const wanted = typeof query === 'string' ? query.toLowerCase() : '';
      const did = didHere();
      return {
        rules: rules()
          .map((rule, position) => ruleSummary(rule, position, did(rule.id)))
          .filter(
            (rule) =>
              !wanted ||
              rule.title.toLowerCase().includes(wanted) ||
              rule.match.url.toLowerCase().includes(wanted),
          ),
      };
    },

    get_rule({ id }: Params) {
      const rule = ruleById(id);
      return { ...report(rule), didHere: didHere()(rule.id) || undefined };
    },

    async save_rule(params: Params) {
      const { top, match, response } = ruleFields(params);
      if (params.id !== undefined) {
        const current = ruleById(params.id);
        const changed = normalizeRule({
          ...current,
          ...top,
          match: { ...current.match, ...match },
          response: { ...current.response, ...response },
        });
        editRule(
          current.id,
          (rule) => {
            rule.name = changed.name;
            rule.enabled = changed.enabled;
            rule.match = changed.match;
            rule.response = changed.response;
          },
          // The agent may reload the page next: it's saved at once.
          { immediate: true },
        );
        moveTo(current.id, params.position);
        noteActivity(`Changed “${ruleTitle(current)}”`, current.id);
        await rulesApplied();
        return { created: false, ...report(current) };
      }
      const base = createRule();
      const made = normalizeRule(
        {
          ...base,
          ...top,
          match: { ...base.match, ...match },
          response: { ...base.response, ...response },
        },
        { newId: true },
      );
      const position = typeof params.position === 'number' ? params.position : 0;
      addRule(made, Math.min(Math.max(Math.trunc(position), 0), rules().length));
      noteActivity(`Created “${ruleTitle(made)}”`, made.id);
      await rulesApplied();
      return { created: true, ...report(made) };
    },

    async delete_rule({ id }: Params) {
      const removed = removeRule(ruleById(id).id)!;
      const title = ruleTitle(removed.rule);
      noteActivity(`Deleted “${title}”`, null);
      notify(`The agent deleted “${title}”`, {
        icon: 'trash',
        action: 'Undo',
        onAction: () => addRule(removed.rule, removed.index),
      });
      await rulesApplied();
      return { deleted: removed.rule, position: removed.index };
    },

    try_url({ url, method, body }: Params) {
      if (typeof url !== 'string' || !url.trim()) throw new Error('Give it a URL.');
      // A path is taken as on the page the editor watches, if that's a dev page: any other page's
      // address stays in the browser.
      const seen = watched();
      const base = seen?.devHost ? seen.url : undefined;
      let full: string;
      try {
        full = new URL(url.trim(), base).href;
      } catch {
        throw new Error(
          `“${url}” isn't a URL${base ? '' : ": give it in full, as the editor isn't watching a dev page to take a path as on"}.`,
        );
      }
      const request = {
        method: typeof method === 'string' ? method : 'GET',
        url: full,
        requestBody: typeof body === 'string' ? body : '',
      };
      const matching = rules()
        .map((rule, position) => ({ rule, position }))
        .filter(({ rule }) => entryTester(rule)(request));
      const answer = matching.find(({ rule }) => rule.enabled);
      const brief = ({ rule, position }: { rule: Rule; position: number }) => ({
        id: rule.id,
        title: ruleTitle(rule),
        position,
        enabled: rule.enabled,
      });
      return {
        method: request.method,
        url: full,
        answeredBy: answer ? brief(answer) : null,
        alsoMatching: matching.filter((each) => each !== answer).map(brief),
        note: settingsStore.state.enabled
          ? undefined
          : "Ghostfetch is paused (its toolbar popup), so nothing answers until it's resumed.",
      };
    },

    recent_requests({ limit, url, action }: Params) {
      const dev = devPage();
      const count = Math.min(Math.max(Math.trunc(Number(limit)) || 30, 1), 200);
      const { record } = settingsStore.state;
      const requests = log
        .snapshot()
        .entries.toReversed()
        .filter(
          (entry) =>
            (typeof url !== 'string' || entry.url.includes(url)) &&
            (!action || (action === 'none' ? !entry.action : entry.action === action)),
        )
        .slice(0, count);
      return {
        page: { url: dev.url, title: dev.title },
        recording: record,
        note: record
          ? undefined
          : "Recording is off (the toolbar popup's Recording), so new requests aren't logged.",
        requests: requests.map(requestSummary),
      };
    },

    get_request({ id, maxBody }: Params) {
      const entry = entryById(id);
      const max = Math.min(
        Math.max(Math.trunc(Number(maxBody ?? 20000)) || 0, 0),
        1_000_000,
      );
      const body = (text: string) =>
        text.length > max
          ? { text: text.slice(0, max), cutCharacters: text.length - max }
          : text;
      return {
        ...requestSummary(entry),
        contentType: entry.contentType,
        requestBody: body(entry.requestBody),
        responseBody: body(entry.responseBody),
        note: entry.truncated
          ? 'The response was over 1 MB: the log keeps its first 1 MB.'
          : undefined,
      };
    },

    async mock_request({ id, name }: Params) {
      const entry = entryById(id);
      const draft = ruleFromEntry(entry);
      if (typeof name === 'string') draft.name = name;
      const made = addRule(normalizeRule(draft), 0);
      // Its Diff compares it with what the server sent, as Mock this response's does.
      if (fromServer(entry)) keepServerResponse(made.id, responseFromEntry(entry));
      noteActivity(
        `Created “${ruleTitle(made)}” from ${entry.method} ${pathOf(entry.url)}`,
        made.id,
      );
      await rulesApplied();
      const result = { created: true, ...report(made) };
      if (entry.truncated)
        result.problems.push('The response was over 1 MB: the rule has its first 1 MB.');
      return result;
    },
  } satisfies Record<string, (params: Params) => unknown>;
}

// Runs the tool `method` asks for, with what the agent gave it.
export function runAgentTool(
  tools: ReturnType<typeof createAgentTools>,
  method: string,
  params: unknown,
) {
  if (!Object.hasOwn(tools, method)) throw new Error(`Ghostfetch has no tool ${method}.`);
  const tool = tools[method as keyof typeof tools] as (params: Params) => unknown;
  return tool(isObject(params) ? params : {});
}
