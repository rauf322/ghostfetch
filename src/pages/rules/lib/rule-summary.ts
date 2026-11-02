// What a rule says it does: the line under its name in the list (ruleSummary), the sentence under
// its name in the editor (describeRule), and the value each setting shows on its row.
import { BODY_MODES, MATCH_MODES } from '../../../shared/api/index.ts';
import type { Rule } from '../../../shared/api/index.ts';
import { formatDuration, statusLabel } from '../../../shared/lib/index.ts';
import { regexError } from './rule-checks.ts';

export function ruleSummary(rule: Rule) {
  const { bodyMode, status, delay } = rule.response;
  return [BODY_MODES[bodyMode].label, status, delay ? formatDuration(delay) : '']
    .filter(Boolean)
    .join(' · ');
}

// "404 Not Found"; with no code, what the page gets instead: 200 OK with your body, or the
// server's own status.
export function statusValue({ response }: Rule) {
  const code = response.status.trim();
  if (code) return statusLabel(code);
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
// "Answers GET requests whose URL contains /api/user with the JSON below and 2 headers changed,
// without calling the server."
export function describeRule(rule: Rule) {
  const { match, response } = rule;
  const url = match.url.trim();
  const operation = match.graphqlOperation.trim();
  if (!url && !operation) return 'Matches no requests yet: give it a URL to match.';
  if (regexError(rule)) return "Matches no requests: its URL regex doesn't compile.";
  const where = url ? ` ${MATCH_MODES[match.mode].said} ${url}` : '';
  const requests = `${match.method === 'ANY' ? 'requests' : `${match.method} requests`}${where}${
    operation ? ` for the GraphQL operation ${operation}` : ''
  }`;
  const status = response.status.trim();
  const delay = response.delay ? formatDuration(response.delay) : '';
  const headers = response.headers.length;
  const headerCount = headers ? `${headers} ${headers === 1 ? 'header' : 'headers'}` : '';

  if (response.bodyMode === 'replace') {
    const body = /json/i.test(response.contentType) ? 'the JSON below' : 'the body below';
    const answer = listed([
      status && `a ${status}`,
      body,
      headerCount && `${headerCount} changed`,
    ]);
    return `Answers ${requests} with ${answer}${delay ? ` after ${delay}` : ''}, without calling the server.`;
  }
  const changes = [
    status && `sets the status to ${status}`,
    headerCount && `changes ${headerCount}`,
    delay && `holds the response back by ${delay}`,
  ];
  if (!changes.some(Boolean))
    return `Lets ${requests} through to the server, and changes nothing yet.`;
  return `Lets ${requests} through to the server, then ${listed(changes)}.`;
}

// "a, b and c", leaving out the empty ones.
function listed(parts: string[]) {
  const words = parts.filter(Boolean);
  return words.length < 2
    ? words.join('')
    : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}
