// The group whose name is a field in the rule list, to type its name in: one just made (New group,
// a rule's Move to group → New group…) or copied, or one being renamed. Only one at a time.
// Giving a group the name typed there is the order's renameGroup() (src/bounded-contexts/rules/).
import { filterEntries } from '../domain/filter-rules.ts';
import { renameGroup, ruleStore } from '../index.ts';
import { createStore } from '../../../lib/index.ts';
import { notify } from '../../../ui/kit/toast.tsx';
import { showSidebar } from '../../../ui/sidebar.tsx';

const state: { id: string | null } = { id: null };
export const renamingStore = /* @__PURE__ */ createStore(state);

// Makes a group's name a field to type in, or with null none's.
export function setRenaming(id: string | null) {
  state.id = id;
  renamingStore.emit();
}

// The rule list's search, as the editor's sidebar has it (app/sidepanel/sidebar.tsx): what's typed
// in it, and its clear, which empties it as the field's own (Esc, or its ✕) does.
let search = { query: '', clear: () => {} };
export function setListSearch(next: { query: string; clear: () => void }) {
  search = next;
}

// What shows the rule list where the open rule has taken its place, in a narrow panel: the rule
// closed, as its back button does (app/sidepanel/editor.tsx).
let showList = () => {};
export function setShowList(show: () => void) {
  showList = show;
}

// The rule list's tree, as drawn (rule-list.tsx).
const TREE = '[role="tree"][data-entries]';

// A group's name to type in the list, where it'll be seen: a new one's (the list's New group, a
// rule's Move to group → New group…) or a copy's (Duplicate), from the list, its menus, or the open
// rule's. The sidebar shows if ⌘B hid it; a search that would keep the group out of the list is
// cleared; and in a narrow panel, where the open rule has the list's place, the list comes back,
// the name a field a frame on: the menu that asked for it goes with the rule, and gives the focus
// back to what had it before as it goes, which would take it from the field.
export function nameInList(id: string) {
  showSidebar();
  const { query } = search;
  if (
    query.trim() &&
    !filterEntries(ruleStore.state.entries, query).some(
      (entry) => entry.kind === 'group' && entry.group.id === id,
    )
  )
    search.clear();
  if (document.querySelector<HTMLElement>(TREE)?.checkVisibility()) {
    setRenaming(id);
    return;
  }
  showList();
  requestAnimationFrame(() => setRenaming(id));
}

// Gives a group the name typed for it, in the list or in a crumb. Names are each group's own
// (order.ts): one another group has is turned down, said so in a toast, and the field stays for
// another (rename-field.tsx).
export function renameGroupTo(id: string, name: string) {
  if (renameGroup(id, name) !== 'taken') return true;
  notify(`There's already a group called “${name}”`, {
    kind: 'error',
    description: 'Each group has a name of its own: pick another.',
  });
  return false;
}
