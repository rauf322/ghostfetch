// Dragging in the rule list: a rule to a new place, into a group, out of one or between them; or a
// group, with its rules, to a new place among the top-level entries. The order is the rules'
// priority (docs/adr/0001): rules are tried top to bottom and the first match wins, whether the
// rules dragged past are on or off. Where something lands, by what's under the pointer:
//
// - a rule's row: a rule, above or below it, in its group or none; a group, above or below it if
//   it's ungrouped (a rule in a group leaves it to the group's block: groups don't go in groups);
// - a group's header: a rule above its middle goes before the group, ungrouped, and below it at
//   the top of the group; as does one over a group with no rules, under its header;
// - a group's block, its header and rules together: a group, above or below it;
// - the list under its last entry: either, at the end of the list, after the last entry it shows
//   (out of any group).
//
// Anywhere else nothing lands, and no mark says it would: over the list's label, or out of it.
import { useLayoutEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { moveGroup, moveRule, placeOf, ruleStore } from '../index.ts';
import type { Entry, Group, Rule } from '../index.ts';

interface Dragged {
  kind: 'rule' | 'group';
  id: string;
}
type Over =
  | { kind: 'rule'; id: string; after: boolean }
  | { kind: 'header'; id: string; into: boolean }
  | { kind: 'block'; id: string; after: boolean }
  | { kind: 'end' };
interface Drag {
  dragged: Dragged;
  over: Over | null;
}
// What the handlers read when they're called: the drag, and the last entry the list shows.
interface Now {
  drag: Drag | null;
  last: Entry | undefined;
}
type Handlers = Partial<
  Record<
    'onDragStart' | 'onDragOver' | 'onDragLeave' | 'onDrop',
    (event: DragEvent<HTMLElement>) => void
  >
>;
type Kind = 'rule' | 'header' | 'block' | 'empty' | 'list';

// What a rule's row, a group's header and a group's block get from useRuleDrag().
export interface RowDrag {
  drop: 'before' | 'after' | undefined;
  dragging: boolean;
  handlers: Handlers;
}
export interface HeaderDrag {
  drop: 'before' | 'into' | undefined;
  dragging: boolean;
  handlers: Handlers;
}
export interface BlockDrag {
  drop: 'before' | 'after' | undefined;
  handlers: Handlers;
}

// Whether the pointer is in the lower half of what it's over.
function lower(event: DragEvent<HTMLElement>) {
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientY > box.top + box.height / 2;
}

// Whether the pointer is under the list's last entry: the list's entries are its [data-entries].
function pastTheEnd(event: DragEvent<HTMLElement>) {
  const entries = event.currentTarget.querySelector('[data-entries]');
  return Boolean(entries) && event.clientY > entries!.getBoundingClientRect().bottom;
}

function groupAt(id: string) {
  return ruleStore.state.entries.findIndex(
    (entry) => entry.kind === 'group' && entry.group.id === id,
  );
}

function same(a: Over | null, b: Over | null) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// The handlers of a row, a header, a block or the list, made once for each. They read the drag
// when they're called (`now`), so a row that hasn't drawn again since still moves what's dragged to
// the right place; and they look its place up in the order then, not as it was drawn.
function makeHandlers(
  kind: Kind,
  id: string,
  now: { current: Now },
  setDrag: (drag: Drag | null) => void,
): Handlers {
  const hover = (over: Over | null) => {
    const { drag } = now.current;
    if (drag && !same(drag.over, over)) setDrag({ ...drag, over });
  };
  // The drag is over: no mark where it would land, nothing faded as being dragged.
  const end = () => setDrag(null);
  // The browser ends a drag (dropped, let go elsewhere, or Esc) with a dragend at what was dragged.
  // A move into a group or out of one draws the rule's row anew in another list, and takes out the
  // row the drag started on: React, which hears events where the list is, no longer hears that
  // row's. So the drag ends where it's dropped (each onDrop), and the row is listened to itself.
  const start = (dragged: Dragged) => (event: DragEvent<HTMLElement>) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragged.id);
    event.currentTarget.addEventListener('dragend', end, { once: true });
    setDrag({ dragged, over: null });
  };

  if (kind === 'rule')
    return {
      onDragStart: start({ kind: 'rule', id }),
      onDragOver(event) {
        const dragged = now.current.drag?.dragged;
        if (!dragged) return;
        if (dragged.kind === 'group' && placeOf(id)?.group) return;
        event.preventDefault();
        event.stopPropagation();
        hover(
          dragged.kind === 'rule' && dragged.id === id
            ? null
            : { kind: 'rule', id, after: lower(event) },
        );
      },
      onDrop(event) {
        const dragged = now.current.drag?.dragged;
        const place = placeOf(id);
        if (!dragged || !place || (dragged.kind === 'rule' && dragged.id === id)) return;
        if (dragged.kind === 'group' && place.group) return;
        event.preventDefault();
        event.stopPropagation();
        const index = place.index + (lower(event) ? 1 : 0);
        if (dragged.kind === 'group') moveGroup(dragged.id, index);
        else moveRule(dragged.id, { group: place.group, index });
        end();
      },
    };
  if (kind === 'header' || kind === 'empty')
    return {
      onDragStart: kind === 'header' ? start({ kind: 'group', id }) : undefined,
      onDragOver(event) {
        const dragged = now.current.drag?.dragged;
        if (!dragged || dragged.kind === 'group') return;
        event.preventDefault();
        event.stopPropagation();
        hover({ kind: 'header', id, into: kind === 'empty' || lower(event) });
      },
      onDrop(event) {
        const dragged = now.current.drag?.dragged;
        if (!dragged || dragged.kind === 'group') return;
        event.preventDefault();
        event.stopPropagation();
        moveRule(
          dragged.id,
          kind === 'empty' || lower(event)
            ? { group: id, index: 0 }
            : { group: '', index: groupAt(id) },
        );
        end();
      },
    };
  if (kind === 'block')
    return {
      onDragOver(event) {
        const dragged = now.current.drag?.dragged;
        if (dragged?.kind !== 'group') return;
        event.preventDefault();
        event.stopPropagation();
        hover(dragged.id === id ? null : { kind: 'block', id, after: lower(event) });
      },
      onDrop(event) {
        const dragged = now.current.drag?.dragged;
        if (dragged?.kind !== 'group' || dragged.id === id) return;
        event.preventDefault();
        event.stopPropagation();
        moveGroup(dragged.id, groupAt(id) + (lower(event) ? 1 : 0));
        end();
      },
    };
  // The list, for what no row, header or block took: under its last entry, the end of the list,
  // unless that entry is what's dragged, which would stay where it is; anywhere else (its label,
  // the edges beside the rows), nowhere. Where a drop there puts what's dragged, or null.
  const toEnd = (event: DragEvent<HTMLElement>) => {
    const { drag, last } = now.current;
    if (!drag || !last || !pastTheEnd(event)) return null;
    const lastId = last.kind === 'rule' ? last.rule.id : last.group.id;
    if (lastId === drag.dragged.id) return null;
    const at = last.kind === 'rule' ? (placeOf(lastId)?.index ?? -1) : groupAt(lastId);
    return at === -1 ? null : { dragged: drag.dragged, index: at + 1 };
  };
  return {
    onDragOver(event) {
      if (!now.current.drag) return;
      if (!toEnd(event)) {
        hover(null);
        return;
      }
      event.preventDefault();
      hover({ kind: 'end' });
    },
    // Out of the list (into the rest of the editor, or out of the window): nowhere.
    onDragLeave(event) {
      const box = event.currentTarget.getBoundingClientRect();
      const { clientX: x, clientY: y } = event;
      if (x <= box.left || x >= box.right || y <= box.top || y >= box.bottom) hover(null);
    },
    onDrop(event) {
      const move = toEnd(event);
      if (!move) return;
      event.preventDefault();
      if (move.dragged.kind === 'group') moveGroup(move.dragged.id, move.index);
      else moveRule(move.dragged.id, { group: '', index: move.index });
      end();
    },
  };
}

// For each row, header and block: where what's dragged would land against it, whether it's what's
// being dragged, and the handlers that move it, the same ones on every draw, so a row draws again
// only when its rule or where it stands in the drag changes (rule-list-item.tsx); and the list's
// own handlers. `last` is the last entry the list shows, which a drop under it lands after.
export function useRuleDrag(last: Entry | undefined) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const now = useRef<Now>({ drag, last });
  // Once the list has drawn, before any event can reach a row.
  useLayoutEffect(() => {
    now.current = { drag, last };
  });
  const [cache] = useState(() => new Map<string, Handlers>());
  const handlers = (kind: Kind, id: string) => {
    const key = `${kind}:${id}`;
    let made = cache.get(key);
    if (!made) {
      made = makeHandlers(kind, id, now, setDrag);
      cache.set(key, made);
    }
    return made;
  };
  const over = drag?.over;
  // The entry a drop under the list would land after, marked as a drop after it.
  const endsAfter = over?.kind === 'end' ? last : undefined;
  return {
    rule: (rule: Rule): RowDrag => ({
      drop:
        over?.kind === 'rule' && over.id === rule.id
          ? over.after
            ? 'after'
            : 'before'
          : endsAfter?.kind === 'rule' && endsAfter.rule.id === rule.id
            ? 'after'
            : undefined,
      dragging: drag?.dragged.kind === 'rule' && drag.dragged.id === rule.id,
      handlers: handlers('rule', rule.id),
    }),
    header: (group: Group): HeaderDrag => ({
      drop:
        over?.kind === 'header' && over.id === group.id
          ? over.into
            ? 'into'
            : 'before'
          : undefined,
      dragging: drag?.dragged.kind === 'group' && drag.dragged.id === group.id,
      handlers: handlers('header', group.id),
    }),
    block: (group: Group): BlockDrag => ({
      drop:
        over?.kind === 'block' && over.id === group.id
          ? over.after
            ? 'after'
            : 'before'
          : endsAfter?.kind === 'group' && endsAfter.group.id === group.id
            ? 'after'
            : undefined,
      handlers: handlers('block', group.id),
    }),
    empty: (group: Group) => handlers('empty', group.id),
    list: () => handlers('list', ''),
  };
}

export type ListDrag = ReturnType<typeof useRuleDrag>;
