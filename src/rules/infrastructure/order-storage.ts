// Where the order is kept, for the screens' copy of it (application/store.ts, which alone calls
// this): read from chrome.storage.local as a view opens (the editor, the popup), written back at
// once or after a short pause, and read again whenever another view (the popup, another window)
// writes it.
//
// The order (domain/order.ts) is kept as two lists: `rules` as it always has been, each rule
// saying which group it's in, which is what the page reads (the bridge) and what an older version
// would read; and `groups`, each with its place among the top-level entries (`at`), which is also
// where a group with no rules stands.
import { normalizeGroups } from '../domain/group.ts';
import { layOut, rulesIn, storedGroups } from '../domain/order.ts';
import type { Entry } from '../domain/order.ts';
import { normalizeRules } from '../domain/rule.ts';

// Every write is tagged with this view's id, so the change event it triggers can be told
// apart from edits made elsewhere. (Comparing contents doesn't work: Chrome returns
// stored objects with their keys sorted, and events can arrive after a newer write.)
let writer = '';
let writes = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
// This view's order as it stands whenever it's asked for (watchOrder()): what a write takes.
let current: () => Entry[] = () => [];

// The order as it's stored, read as a view opens, which is when the view gets its id, too.
export async function readOrder() {
  writer = crypto.randomUUID();
  const stored = await chrome.storage.local.get({ rules: [], groups: [] });
  return read(stored.rules, stored.groups);
}

// From here on: `order` gives this view's order to whatever writes it; `heard` gets the order as
// another view left it, each time one writes it, which takes the place of a write still waiting
// here; and a write still waiting as the page goes is made then.
export function watchOrder(order: () => Entry[], heard: (order: Entry[]) => void) {
  current = order;

  chrome.storage.onChanged.addListener((changed, area) => {
    if (
      area === 'local' &&
      (changed.rules || changed.groups) &&
      !(changed.rulesWriter?.newValue as string | undefined)?.startsWith(`${writer}:`)
    ) {
      clearTimeout(saveTimer!);
      saveTimer = null;
      // A view writes both; one that wrote only one of them left the other as it was here.
      const here = current();
      heard(
        read(
          changed.rules ? changed.rules.newValue : rulesIn(here),
          changed.groups ? changed.groups.newValue : storedGroups(here),
        ),
      );
    }
  });

  // Don't lose the last few keystrokes if the panel is closed mid-debounce.
  window.addEventListener('pagehide', () => {
    if (saveTimer) saveOrder({ immediate: true });
  });
}

// The order from rules and groups as they're stored, each rebuilt first: storage can't be trusted.
function read(rules: unknown, groups: unknown) {
  return layOut(normalizeRules(rules), normalizeGroups(groups));
}

// Writes the rules and the groups to storage, at once or after a short pause. For
// application/store.ts alone: every change goes through its functions, which also tell the
// screens to redraw.
export function saveOrder({ immediate = false } = {}) {
  clearTimeout(saveTimer!);
  const write = () => {
    saveTimer = null;
    const order = current();
    chrome.storage.local.set({
      rules: rulesIn(order),
      groups: storedGroups(order),
      rulesWriter: `${writer}:${++writes}`,
    });
  };
  if (immediate) write();
  else saveTimer = setTimeout(write, 250);
}

// Writes an edit that's waiting out the pause now.
export function saveOrderNow() {
  if (saveTimer) saveOrder({ immediate: true });
}
