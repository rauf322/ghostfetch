// The group whose name is a field in the rule list, to type its name in: one just made (New group,
// a rule's Move to group → New group…) or copied, or one being renamed. Only one at a time.
// Giving a group the name typed there is the order's renameGroup() (src/rules/).
import { createStore } from '../../../lib/index.ts';

const state: { id: string | null } = { id: null };
export const renamingStore = /* @__PURE__ */ createStore(state);

// Makes a group's name a field to type in, or with null none's.
export function setRenaming(id: string | null) {
  state.id = id;
  renamingStore.emit();
}
