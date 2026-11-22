// What the bridge in each page sends the interceptor in its page world: the rules that answer,
// each as the editor reads it, with the two switches. Types only: nothing of this file ends up in
// the built extension. Every other message is its context's own: Traffic's are in
// src/bounded-contexts/traffic/contract.ts, and Sites' in src/bounded-contexts/sites/contract.ts.
// This is Rules' published language to Interception (GLOSSARY-MAP.md).
import type { Rule } from './domain/types.ts';

// A rule as the page gets it: rebuilt as the editor reads it (normalizeRule, domain/rule.ts), not
// as it's stored, which an older version or a hand may have left in any shape; and with the name
// of its group, if it's in one, which the traffic log keeps beside the rule's own.
export type PageRule = Rule & { groupName?: string };

// The bridge to the interceptor, over their private MessageChannel: the rules that answer.
export interface PageState {
  type: 'state';
  enabled: boolean;
  record: boolean;
  rules: PageRule[];
}
