// "Mock this response": a response rule made from a request in the log. It matches the request's
// method and path (for GraphQL, its path and operation) and returns its status and body.
import { METHODS, createRule } from '../../../entities/rule/index.ts';
import type { Method } from '../../../entities/rule/index.ts';
import type { LogEntry } from '../../../entities/traffic/index.ts';
import { formatJson } from '../../../shared/lib/json/index.ts';
import { splitUrl } from '../../../shared/lib/url/index.ts';

export function ruleFromEntry(entry: LogEntry) {
  const rule = createRule('response');
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

// The operation a GraphQL request body names: its operationName, or else the name after query,
// mutation or subscription; '' when there's none.
function graphqlOperation(body: string) {
  try {
    const parsed = JSON.parse(body);
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    return (
      first?.operationName ||
      /^\s*(?:query|mutation|subscription)\s+(\w+)/.exec(first?.query || '')?.[1] ||
      ''
    );
  } catch {
    return '';
  }
}
