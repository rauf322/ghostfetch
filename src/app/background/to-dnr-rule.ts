// One redirect, header or block rule as the declarativeNetRequest rule the browser applies, for
// requests started by `initiators`, the hosts Ghostfetch runs on. Throws, in the words the editor
// shows on the rule, when it can't be one yet: no URL pattern, no destination or one that isn't a
// full URL, no headers.
import { dnrUrlFilter } from '../../entities/rule/index.ts';
import type { HeaderRow, Rule } from '../../entities/rule/index.ts';

export type DnrRule = chrome.declarativeNetRequest.Rule;

const RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'other',
] as chrome.declarativeNetRequest.ResourceType[];

export function toDnrRule(rule: Rule, id: number, initiators: string[]): DnrRule {
  const { url, mode, method } = rule.match;
  const pattern = url.trim();
  if (!pattern) throw new Error('Add a URL pattern first.');

  // Only requests started by pages Ghostfetch runs on are touched, never the rest of your browsing.
  const condition: chrome.declarativeNetRequest.RuleCondition = {
    resourceTypes: RESOURCE_TYPES,
    initiatorDomains: initiators,
  };
  if (mode === 'regex') condition.regexFilter = pattern;
  else condition.urlFilter = dnrUrlFilter(mode, pattern);
  if (method && method !== 'ANY')
    condition.requestMethods = [
      method.toLowerCase() as chrome.declarativeNetRequest.RequestMethod,
    ];

  return { id, priority: 1, condition, action: toDnrAction(rule) };
}

function toDnrAction(rule: Rule): chrome.declarativeNetRequest.RuleAction {
  if (rule.type === 'block')
    return { type: 'block' as chrome.declarativeNetRequest.RuleActionType };

  if (rule.type === 'redirect') {
    const to = rule.redirect.to.trim();
    if (!to) throw new Error('Add a destination URL.');
    if (rule.match.mode === 'regex' && /\\\d/.test(to)) {
      return {
        type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
        redirect: { regexSubstitution: to },
      };
    }
    let target;
    try {
      target = new URL(to).href;
    } catch {
      throw new Error(
        `"${to}" is not a full URL. Include the scheme, e.g. http://localhost:3000/api`,
      );
    }
    return {
      type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
      redirect: { url: target },
    };
  }

  const convert = (list: HeaderRow[]) =>
    list
      .filter((row) => row.name.trim())
      .map(
        (row) =>
          (row.op === 'remove'
            ? { header: row.name.trim(), operation: 'remove' }
            : {
                header: row.name.trim(),
                operation: 'set',
                value: row.value ?? '',
              }) as chrome.declarativeNetRequest.ModifyHeaderInfo,
      );
  const requestHeaders = convert(rule.headers.request);
  const responseHeaders = convert(rule.headers.response);
  if (!requestHeaders.length && !responseHeaders.length)
    throw new Error('Add at least one header.');
  return {
    type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
    ...(requestHeaders.length && { requestHeaders }),
    ...(responseHeaders.length && { responseHeaders }),
  };
}
