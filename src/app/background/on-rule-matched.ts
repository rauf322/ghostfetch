// A redirect, header or block rule fired on a request: the tab's traffic log hears of it through
// the bridge in its top frame, with the rule's name and what it did.
import { ruleTitle } from '../../entities/rule/index.ts';
import { loadState } from './stored-state.ts';

// Only fires for unpacked extensions, which is exactly how Ghostfetch is meant to be installed.
export async function onRuleMatched({
  request,
  rule,
}: chrome.declarativeNetRequest.MatchedRuleInfoDebug) {
  if (request.tabId < 0) return;
  const { dnrMap = {} } = await chrome.storage.session.get('dnrMap');
  const ruleId = (dnrMap as Record<number, string>)[rule.ruleId];
  if (!ruleId) return;
  const { rules } = await loadState();
  const matched = rules.find((candidate) => candidate.id === ruleId);
  if (!matched) return;

  const entry = {
    time: Date.now(),
    kind: request.type,
    method: request.method.toUpperCase(),
    url: request.url,
    status: null,
    ruleId,
    ruleName: ruleTitle(matched),
    action: matched.type,
  };
  chrome.tabs
    .sendMessage(request.tabId, { type: 'ghostfetch:dnrHit', entry }, { frameId: 0 })
    .catch(() => {});
}
