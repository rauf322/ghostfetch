// "Mock this response" (Traffic) and Mock (New rule): a rule made from a request in the log. It
// matches the request's method and path (for GraphQL, its path and operation) and returns its
// status and body.
import { formatJson, splitUrl } from '../../lib/index.ts';
import type { LogEntry } from '../../traffic/index.ts';
import { METHODS } from '../domain/catalog.ts';
import { bodyOperation } from '../../kernel/index.ts';
import { createRule } from '../domain/rule.ts';
import type { Method } from '../../kernel/index.ts';

export function ruleFromEntry(entry: LogEntry) {
  const rule = createRule();
  const { path, pathname } = splitUrl(entry.url);
  const operation = graphqlOperation(entry.requestBody);
  rule.match.method = (METHODS as readonly string[]).includes(entry.method)
    ? (entry.method as Method)
    : 'ANY';
  rule.match.mode = 'equals';
  rule.match.url = operation ? pathname : path;
  rule.match.graphqlOperation = operation;
  rule.response.body = formatJson(entry.responseBody) ?? entry.responseBody;
  rule.response.status = entry.status && entry.status !== 200 ? String(entry.status) : '';
  if (entry.contentType)
    rule.response.contentType = entry.contentType.split(';')[0].trim();
  return rule;
}

// The operation a GraphQL request body names (bodyOperation), as the text a rule matches by: ''
// when it names none, or what it has there isn't text. New rule reads a pasted cURL command's
// body with it too.
export function graphqlOperation(body: string): string {
  const name = bodyOperation(body);
  return typeof name === 'string' ? name : '';
}
