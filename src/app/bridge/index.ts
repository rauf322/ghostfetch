// Isolated-world half of the content script. Reads rules from extension storage and hands
// the ones that answer (on, and in no group or a group that's on) to the interceptor (the
// page-world half) over a private MessageChannel, whose port is offered exactly once, before any
// page script runs. The top frame also keeps the tab's traffic log, so the editor can show
// requests made before it was opened, and counts it for the popup: that log is Traffic's
// (src/traffic/infrastructure/tab-log.ts), started here and given what the page reports.
// Built as bridge.js: WXT's wrapper runs this function at once and adds no globals of its own.
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import {
  isResponseRule,
  layOut,
  normalizeGroups,
  wouldAnswer,
} from '../../shared/api/index.ts';
import type { PageState, Rule } from '../../shared/api/index.ts';
import { createTabLog } from '../../traffic/index.ts';

export default defineUnlistedScript(() => {
  // Same two guards as the interceptor. The flag lives in the extension's isolated world, which
  // all its content scripts share and the page can't see.
  const address = new URL(document.URL);
  if (address.username || address.password) return;
  if ((globalThis as { ghostfetchBridge?: boolean }).ghostfetchBridge) return;
  (globalThis as { ghostfetchBridge?: boolean }).ghostfetchBridge = true;

  const isTop = window === window.top;
  // Traffic's log of the tab's requests: what the page reports goes to it (record()), and in the
  // top frame, whose log is the tab's, it's what the popup and the Traffic view ask (listen()).
  const tabLog = createTabLog({ isTop });

  const channel = new MessageChannel();
  const port = channel.port1;
  port.addEventListener('message', ({ data }) => {
    if (data?.type === 'log') tabLog.record(data.entry);
  });
  // Setting onmessage starts a port; with addEventListener, start() does.
  port.start();
  window.postMessage({ ghostfetch: 'port' }, '*', [channel.port2]);
  sendState();

  async function sendState() {
    try {
      const stored = (await chrome.storage.local.get({
        enabled: true,
        record: true,
        rules: [],
        groups: [],
      })) as { enabled: boolean; record: boolean; rules: unknown; groups: unknown };
      tabLog.setRecording(stored.record);
      // The groups as the editor has them, and the rules in the order it shows (order.ts):
      // each group's rules together, in the group's place.
      const groups = normalizeGroups(stored.groups);
      const names = new Map(groups.map((group) => [group.id, group.name]));
      const off = new Set(
        groups.filter((group) => !group.enabled).map((group) => group.id),
      );
      const kept = Array.isArray(stored.rules)
        ? (stored.rules.filter(
            (rule) => rule && typeof rule === 'object' && isResponseRule(rule),
          ) as Rule[])
        : [];
      const ordered = layOut(kept, groups).flatMap((entry) =>
        entry.kind === 'rule' ? [entry.rule] : entry.rules,
      );
      port.postMessage({
        type: 'state',
        enabled: stored.enabled,
        record: stored.record,
        // As they're stored but for their order, which can still include a redirect, header or
        // block rule from before 0.9.0 until the rules are next saved: the ones on, in no group
        // or a group that's on, each in a group with the group's name, for the traffic log.
        rules: ordered
          .filter((rule) => wouldAnswer(rule, !off.has(rule.group)))
          .map((rule) =>
            names.has(rule.group) ? { ...rule, groupName: names.get(rule.group) } : rule,
          ),
      } satisfies PageState);
    } catch {
      // The extension was reloaded or removed; this copy of the script is orphaned.
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === 'local' &&
      (changes.rules || changes.groups || changes.enabled || changes.record)
    )
      sendState();
  });

  if (!isTop) return;

  // The tab's log is the top frame's: it hears an iframe's entries, which the background passes
  // on, the popup's question of what each rule did here, and the Traffic view's connection.
  tabLog.listen();
});
