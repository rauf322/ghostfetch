// A copy of a group, to start another from it (a group's Duplicate, the agent's save_group with
// copyOf): named "… copy" (or "… copy 2" if that's taken) unless it's given a name, on, at the top
// of the list, with a copy of each of the group's rules, their names and switches as they are, each
// body compared with the same server's response as its rule's. At the top, the copy answers in the
// group's place as soon as it's changed. Returns the copy.
import { createGroup, freeName } from '../domain/group.ts';
import { normalizeRule } from '../domain/rule.ts';
import { copyServerResponse } from './server-responses.ts';
import { addGroup, ruleStore } from './store.ts';
import type { Group } from '../domain/types.ts';

export function duplicateGroup(group: Group, name = `${group.name} copy`) {
  const entry = ruleStore.state.entries.find(
    (each) => each.kind === 'group' && each.group.id === group.id,
  );
  const rules = entry?.kind === 'group' ? entry.rules : [];
  const copies = rules.map((rule) => {
    const made = normalizeRule(structuredClone(rule), { newId: true });
    copyServerResponse(rule.id, made.id);
    return made;
  });
  return addGroup(createGroup(freeName(name, ruleStore.state.groups)), 0, copies);
}
