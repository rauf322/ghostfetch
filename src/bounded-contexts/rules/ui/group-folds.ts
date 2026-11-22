// Which groups are folded, in the editor's rule list and the popup's All rules alike: kept in this
// browser, by the groups' ids, and followed by every open editor and the popup when another changes
// it. Read the first time it's asked, so a page that never shows a group never reads it.
import { createStore } from '../../../lib/index.ts';

const KEY = 'ghostfetch.folded';

let folded: Set<string> | null = null;
export const foldStore = /* @__PURE__ */ createStore({});

function read() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return new Set<string>(
      Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [],
    );
  } catch {
    return new Set<string>();
  }
}

function current() {
  if (!folded) {
    folded = read();
    window.addEventListener('storage', (event) => {
      if (event.key !== KEY && event.key !== null) return;
      folded = read();
      foldStore.emit();
    });
  }
  return folded;
}

export function isFolded(id: string) {
  return current().has(id);
}

export function setFolded(id: string, fold: boolean) {
  const ids = current();
  if (fold) ids.add(id);
  else ids.delete(id);
  localStorage.setItem(KEY, JSON.stringify([...ids]));
  foldStore.emit();
}
