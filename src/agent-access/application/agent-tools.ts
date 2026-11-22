// What the agent's tools (mcp/ghostfetch-mcp.mjs) do, here in the editor, with the editor's own
// code: the rules and their groups as src/rules/ keeps them (which saves them, sends them to open
// pages and redraws the screens), and the log of the page the editor watches. What a tool is given
// is checked here again, and a rule is rebuilt by normalizeRule before it's kept, as an imported
// one is. The agent sees requests only from a page on a dev host (localhost, *.localhost,
// 127.0.0.1, local.*): what the editor watches on any other site stays in the browser.
//
// A rule's position is where it's tried in the whole order (0, the first, is tried first); a
// group's is its place among the list's top-level entries, groups and ungrouped rules (0 is the
// top). The agent names a group by its name (names are unique, ignoring case) or its id.
import {
  addGroup,
  addRule,
  createGroup,
  createRule,
  duplicateGroup,
  editRule,
  entryTester,
  findGroup,
  findGroupNamed,
  findRule,
  fromServer,
  groupName,
  groupOf,
  groupPosition,
  inOffGroup,
  isAnswering,
  keepServerResponse,
  moveGroupTo,
  moveRule,
  moveRuleTo,
  normalizeRule,
  placeAt,
  removeGroup,
  removeRule,
  renameGroup,
  responseFromEntry,
  restoreGroup,
  ruleFromEntry,
  ruleStore,
  ruleTitle,
  turnGroup,
  wouldAnswer,
} from '../../rules/index.ts';
import type { Group, Place, Rule } from '../../rules/index.ts';
import { settingsStore } from '../../shared/api/index.ts';
import { siteOf } from '../../sites/index.ts';
import { countRule, countWords } from '../../traffic/index.ts';
import type { LogEntry, TrafficLog } from '../../traffic/index.ts';
import { isDevHost } from '../domain/dev-host.ts';
import { ruleProblems, ruleSummary } from './rule-report.ts';
import { noteActivity } from '../infrastructure/agent-connection.ts';

type Params = Record<string, unknown>;

const isObject = (value: unknown): value is Params =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

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
      ? {
          id: entry.ruleId,
          name: entry.ruleName,
          group: entry.groupName || undefined,
          did: entry.action || 'nothing',
        }
      : null,
    error: entry.error || undefined,
    frame: entry.frame || undefined,
    requestBodyLength: entry.requestBody.length,
    responseBodyLength: entry.responseBody.length,
    truncated: entry.truncated || undefined,
  };
}

// The rules of a group, in their order.
function rulesOf(group: Group) {
  const entry = ruleStore.state.entries.find(
    (each) => each.kind === 'group' && each.group.id === group.id,
  );
  return entry?.kind === 'group' ? entry.rules : [];
}

// A group as the tools tell of it.
function groupBrief(group: Group) {
  const rules = rulesOf(group);
  return {
    id: group.id,
    name: group.name,
    enabled: group.enabled,
    position: groupPosition(group.id),
    rules: rules.length,
    rulesOn: rules.filter((rule) => rule.enabled).length,
  };
}

// The group a tool names, by its id or its name.
function groupNamed({ id, name }: Params) {
  const found =
    (typeof id === 'string' ? findGroup(id) : undefined) ??
    (typeof name === 'string' && id === undefined ? findGroupNamed(name) : undefined);
  if (!found)
    throw new Error(
      `No group has the ${id !== undefined ? `id ${JSON.stringify(id)}` : `name ${JSON.stringify(name)}`}: list_rules has them.`,
    );
  return found;
}

// The editor's toast, the kit's notify, which use-agent-access.ts passes in: a rule or a group the
// agent deletes comes back with its Undo.
type Notify = (
  title: string,
  options: { icon: 'trash'; action: string; onAction: () => void },
) => void;

export function createAgentTools({
  log,
  place,
  notify,
}: {
  log: TrafficLog;
  place: string;
  notify: Notify;
}) {
  const rules = () => ruleStore.state.rules;
  const positionOf = (id: string) => rules().findIndex((rule) => rule.id === id);
  // Whether a rule answers the requests it matches: it's on, its group is too, and Ghostfetch
  // isn't paused.
  const answering = (rule: Rule) =>
    isAnswering(rule, !inOffGroup(rule), !settingsStore.state.enabled);

  // The page the editor watches, or null with none: for the editor's own use.
  function watched() {
    const { target, targetUrl, connected } = log.snapshot();
    const url = targetUrl || target?.url || '';
    if (!url) return null;
    return {
      url,
      title: target?.title ?? '',
      devHost: isDevHost(siteOf(url)),
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

  // The group a rule goes into, as a tool gave it: by its id or its name, made (at the top of the
  // list, on) if no group has that name; '' (or null) for none; undefined if the tool gave none.
  function groupFor(value: unknown) {
    if (value === undefined) return undefined;
    if (value === null) return '';
    if (typeof value !== 'string')
      throw new Error('group is the name (or id) of a group, or "" for none.');
    const byId = findGroup(value);
    if (byId) return byId.id;
    const name = groupName(value);
    if (!name) return '';
    const found = findGroupNamed(name);
    if (found) return found.id;
    const made = addGroup(createGroup(name), 0);
    noteActivity(`Created the group “${name}”`, null);
    return made.id;
  }

  // What keeps a group from answering.
  function groupProblems(group: Group) {
    const problems: string[] = [];
    if (!group.enabled)
      problems.push(
        "It's off, so none of its rules answer until it's turned on (save_group with enabled: true).",
      );
    if (!settingsStore.state.enabled)
      problems.push(
        "Ghostfetch is paused (its toolbar popup), so no rule answers until it's resumed.",
      );
    return problems;
  }

  // A rule after a change: where it is, and what keeps it from answering.
  function report(rule: Rule) {
    const problems = ruleProblems(rule);
    const group = groupOf(rule);
    if (!rule.enabled)
      problems.push("It's off, so it answers nothing until it's turned on.");
    if (group && !group.enabled)
      problems.push(
        `Its group “${group.name}” is off, so it answers nothing until the group is turned on (save_group with enabled: true).`,
      );
    if (!settingsStore.state.enabled)
      problems.push(
        "Ghostfetch is paused (its toolbar popup), so no rule answers until it's resumed.",
      );
    return { rule, group: group?.name, position: positionOf(rule.id), problems };
  }

  // Where a rule goes: in `group` ('' for none), at `position` in the order if one is given, or
  // else at the top of the group, or of the list.
  function placeFor(group: string, position: unknown): Place {
    return typeof position === 'number' && Number.isFinite(position)
      ? placeAt(Math.trunc(position), group)
      : { group, index: 0 };
  }

  return {
    status() {
      const { enabled, record } = settingsStore.state;
      const { groups } = ruleStore.state;
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
          answering: rules().filter(answering).length,
        },
        groups: {
          total: groups.length,
          on: groups.filter((group) => group.enabled).length,
        },
      };
    },

    list_rules({ query }: Params) {
      const wanted = typeof query === 'string' ? query.toLowerCase() : '';
      const did = didHere();
      return {
        groups: ruleStore.state.groups.map(groupBrief),
        rules: rules()
          .map((rule, position) =>
            ruleSummary(rule, {
              position,
              group: groupOf(rule),
              answering: answering(rule),
              did: did(rule.id),
            }),
          )
          .filter(
            (rule) =>
              !wanted ||
              rule.title.toLowerCase().includes(wanted) ||
              rule.match.url.toLowerCase().includes(wanted) ||
              Boolean(rule.group?.toLowerCase().includes(wanted)),
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
        const group = groupFor(params.group);
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
        if (typeof params.position === 'number')
          moveRuleTo(current.id, Math.trunc(params.position), group);
        else if (group !== undefined && group !== current.group)
          // Into a group, at its top; out of one, just above it, so it's tried about where it was.
          moveRule(
            current.id,
            group
              ? { group, index: 0 }
              : { group: '', index: Math.max(groupPosition(current.group), 0) },
          );
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
      addRule(made, placeFor(groupFor(params.group) ?? '', params.position));
      noteActivity(`Created “${ruleTitle(made)}”`, made.id);
      await rulesApplied();
      return { created: true, ...report(made) };
    },

    async delete_rule({ id }: Params) {
      const position = positionOf(ruleById(id).id);
      const removed = removeRule(ruleById(id).id)!;
      const title = ruleTitle(removed.rule);
      const group = findGroup(removed.place.group)?.name;
      noteActivity(`Deleted “${title}”`, null);
      notify(`The agent deleted “${title}”`, {
        icon: 'trash',
        action: 'Undo',
        onAction: () => addRule(removed.rule, removed.place),
      });
      await rulesApplied();
      return { deleted: removed.rule, group, position };
    },

    async save_group(params: Params) {
      const { id, name, enabled, position, copyOf } = params;
      const wanted = typeof name === 'string' ? groupName(name) : '';
      if (name !== undefined && !wanted)
        throw new Error("A group's name can't be empty.");
      let group =
        typeof id === 'string'
          ? findGroup(id)
          : wanted
            ? findGroupNamed(wanted)
            : undefined;
      if (id !== undefined && !group)
        throw new Error(
          `No group has the id ${JSON.stringify(id)}: list_rules has them.`,
        );
      const index =
        typeof position === 'number' && Number.isFinite(position)
          ? Math.max(Math.trunc(position), 0)
          : undefined;
      if (!group) {
        if (!wanted)
          throw new Error('Give the new group a name (or an id, to change one).');
        if (copyOf !== undefined) {
          const source = groupNamed({
            id: typeof copyOf === 'string' && findGroup(copyOf) ? copyOf : undefined,
            name: copyOf,
          });
          group = duplicateGroup(source, wanted);
          noteActivity(`Copied “${source.name}” as “${group.name}”`, null);
        } else {
          group = addGroup(createGroup(wanted), 0);
          noteActivity(`Created the group “${group.name}”`, null);
        }
        if (enabled === false) turnGroup(group.id, false);
        if (index !== undefined) moveGroupTo(group.id, index);
        await rulesApplied();
        return {
          created: true,
          group: groupBrief(group),
          problems: groupProblems(group),
        };
      }
      if (copyOf !== undefined)
        throw new Error(
          `A group called “${group.name}” is there already: give the copy a name no group has.`,
        );
      const was = { name: group.name, enabled: group.enabled };
      if (wanted && renameGroup(group.id, wanted) === 'taken')
        throw new Error(
          `Another group is called “${wanted}”: each has a name of its own.`,
        );
      if (typeof enabled === 'boolean') turnGroup(group.id, enabled);
      if (index !== undefined) moveGroupTo(group.id, index);
      noteActivity(
        was.name === group.name && index === undefined && was.enabled !== group.enabled
          ? `Turned “${group.name}” ${group.enabled ? 'on' : 'off'}`
          : `Changed the group “${group.name}”`,
        null,
      );
      await rulesApplied();
      return { created: false, group: groupBrief(group), problems: groupProblems(group) };
    },

    async delete_group(params: Params) {
      const group = groupNamed(params);
      const removed = removeGroup(group.id)!;
      const rulesWord = removed.rules.length
        ? ` and its ${removed.rules.length === 1 ? 'rule' : plural(removed.rules.length, 'rule')}`
        : '';
      noteActivity(`Deleted the group “${group.name}”${rulesWord}`, null);
      notify(`The agent deleted “${group.name}”${rulesWord}`, {
        icon: 'trash',
        action: 'Undo',
        onAction: () => restoreGroup(removed),
      });
      await rulesApplied();
      return {
        deleted: { ...group, position: removed.index },
        rules: removed.rules,
      };
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
      // The first that's on, in no group or a group that's on, as the page decides.
      const answer = matching.find(({ rule }) => wouldAnswer(rule, !inOffGroup(rule)));
      const brief = ({ rule, position }: { rule: Rule; position: number }) => {
        const group = groupOf(rule);
        return {
          id: rule.id,
          title: ruleTitle(rule),
          position,
          enabled: rule.enabled,
          group: group ? { name: group.name, enabled: group.enabled } : undefined,
        };
      };
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

    async mock_request({ id, name, group }: Params) {
      const entry = entryById(id);
      const draft = ruleFromEntry(entry);
      if (typeof name === 'string') draft.name = name;
      const made = addRule(
        normalizeRule(draft),
        placeFor(groupFor(group) ?? '', undefined),
      );
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
