// What a rule says it does: the line under its name in the list (ruleSummary), the sentence under
// its name in the editor (describeRule), and the value each setting shows on its row.
import { BODY_MODES } from '../../../shared/api/index.ts';
import type { MatchMode, Rule } from '../../../shared/api/index.ts';
import { statusName } from '../../../shared/lib/index.ts';

export function ruleSummary(rule: Rule) {
  const { bodyMode, status, delay } = rule.response;
  return [BODY_MODES[bodyMode].label, status, delay ? formatDelay(delay) : '']
    .filter(Boolean)
    .join(' · ');
}

// A delay as the list and the editor show it: "600 ms" under a second, "1 s" or "1.5 s" from
// there on.
export function formatDelay(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${Number((ms / 1000).toFixed(2))} s`;
}

// The URL row's name, for each way of comparing a URL.
export const URL_LABELS: Record<MatchMode, string> = {
  contains: 'URL contains',
  equals: 'URL equals',
  wildcard: 'URL matches',
  regex: 'URL matches regex',
};

// "404 Not Found"; with no code, what the page gets instead: 200 OK with your body, or the
// server's own status.
export function statusValue({ response }: Rule) {
  const code = response.status.trim();
  if (code) return [code, statusName(code)].filter(Boolean).join(' ');
  return response.bodyMode === 'replace' ? '200 OK' : "Server's";
}

// "Sets 2, removes 1", or "No changes".
export function headersValue({ response }: Rule) {
  const set = response.headers.filter((row) => row.op === 'set').length;
  const removed = response.headers.length - set;
  const parts = [set && `sets ${set}`, removed && `removes ${removed}`].filter(Boolean);
  const words = parts.join(', ');
  return words ? words[0]!.toUpperCase() + words.slice(1) : 'No changes';
}

// One sentence that says what the rule does, in words, so it reads without opening anything:
// "Answers GET requests whose URL contains /api/user with the JSON below, without calling the
// server."
export function describeRule({ match, response }: Rule) {
  const url = match.url.trim();
  const operation = match.graphqlOperation.trim();
  if (!url && !operation) return 'Matches no requests yet: give it a URL to match.';
  const where = url
    ? {
        contains: ` whose URL contains ${url}`,
        equals: ` to ${url}`,
        wildcard: ` whose URL matches ${url}`,
        regex: ` whose URL matches the regex ${url}`,
      }[match.mode]
    : '';
  const requests = `${match.method === 'ANY' ? 'requests' : `${match.method} requests`}${where}${
    operation ? ` for the GraphQL operation ${operation}` : ''
  }`;
  const status = response.status.trim();
  const delay = response.delay ? formatDelay(response.delay) : '';

  if (response.bodyMode === 'replace') {
    const body = /json/i.test(response.contentType) ? 'the JSON below' : 'the body below';
    return `Answers ${requests} with ${status ? `a ${status} and ${body}` : body}${
      delay ? ` after ${delay}` : ''
    }, without calling the server.`;
  }
  const headers = response.headers.length;
  const changes = [
    status && `sets the status to ${status}`,
    headers && `changes ${headers} ${headers === 1 ? 'header' : 'headers'}`,
    delay && `holds the response back ${delay}`,
  ].filter(Boolean);
  if (!changes.length)
    return `Lets ${requests} through to the server, and changes nothing yet.`;
  return `Lets ${requests} through to the server, then ${listed(changes as string[])}.`;
}

// "a, b and c"
function listed(parts: string[]) {
  return parts.length < 2
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
