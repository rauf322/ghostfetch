// The group whose name is a field in the rule list, to type its name in: one just made (New group,
// a rule's Move to group → New group…) or copied, or one being renamed. Only one at a time.
import { createStore } from '../../../shared/lib/index.ts';

const state: { id: string | null } = { id: null };
export const renamingStore = /* @__PURE__ */ createStore(state);

export function renameGroup(id: string | null) {
  state.id = id;
  renamingStore.emit();
}
