// What the agent's tools say about a rule: a line for list_rules, and what's wrong with it (as the
// rule editor would point it out: both ask shared/api and the kernel), so an agent can put right
// what it saved.
import { headerProblem } from '../../../kernel/index.ts';
import {
  BODY_MODES,
  bodyProblem,
  regexError,
  ruleTitle,
} from '../../../shared/api/index.ts';
import type { Group, Rule } from '../../../shared/api/index.ts';

// A rule in list_rules: where it's tried in the order, its group, whether it's on and whether it
// answers (it's on, its group is too, and Ghostfetch isn't paused), what it matches, what it
// answers with, in short, and what it did on the page the editor watches ("2 mocked"), when that's
// a dev page.
export function ruleSummary(
  rule: Rule,
  {
    position,
    group,
    answering,
    did,
  }: { position: number; group: Group | undefined; answering: boolean; did: string },
) {
  const { match, response } = rule;
  const replace = response.bodyMode === 'replace';
  return {
    position,
    id: rule.id,
    name: rule.name,
    title: ruleTitle(rule),
    group: group?.name,
    enabled: rule.enabled,
    answering,
    match: {
      method: match.method,
      mode: match.mode,
      url: match.url,
      graphqlOperation: match.graphqlOperation || undefined,
    },
    answers: [
      BODY_MODES[response.bodyMode].label,
      `status ${response.status || (replace ? '200' : "the server's")}`,
      replace &&
        `${response.contentType || 'no Content-Type'}, ${response.body.length} characters`,
      response.delay > 0 && `${response.delay} ms late`,
      response.headers.length > 0 &&
        `${response.headers.length} header row${response.headers.length === 1 ? '' : 's'}`,
    ]
      .filter(Boolean)
      .join(' · '),
    didHere: did || undefined,
  };
}

// What's wrong with a rule, in words: what the rule editor marks (a regex that doesn't compile, a
// JSON body that doesn't parse, a header row the page won't get), and a rule that matches nothing.
export function ruleProblems(rule: Rule): string[] {
  const { match, response } = rule;
  const problems: string[] = [];
  if (!match.url.trim() && !match.graphqlOperation.trim())
    problems.push('It matches no request: it has no URL pattern or GraphQL operation.');
  const regex = regexError(rule);
  if (regex) problems.push(`Its regex doesn't compile, so it matches nothing: ${regex}`);
  const problem = bodyProblem(rule);
  if (problem)
    problems.push(
      problem.to <= problem.from
        ? `Its body isn't valid JSON: ${problem.message}`
        : `Its body isn't valid JSON, at line ${problem.line}, column ${problem.column}: ${problem.message}`,
    );
  for (const row of response.headers) {
    const why = headerProblem(row);
    if (why) problems.push(`Its header row “${row.name}”: ${why}`);
  }
  return problems;
}
