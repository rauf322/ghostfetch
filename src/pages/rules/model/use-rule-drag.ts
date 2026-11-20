// Dragging in the rule list: a rule to a new place, into a group, out of one or between them; or a
// group, with its rules, to a new place among the top-level entries. The order is the rules'
// priority (docs/adr/0001): rules are tried top to bottom and the first match wins, whether the
// rules dragged past are on or off. Where something lands, by what's under the pointer:
//
// - a rule's row: a rule, above or below it, in its group or none; a group, above or below it if
//   it's ungrouped (a rule in a group leaves it to the group's block: groups don't go in groups);
// - a group's header: a rule above its middle goes before the group, ungrouped, and below it at
//   the top of the group; as does one over a group with no rules, under its header;
// - a group's block, its header and rules together: a group, above or below it.
import { useLayoutEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { moveGroup, moveRule, placeOf, ruleStore } from '../../../shared/api/index.ts';
import type { Group, Rule } from '../../../shared/api/index.ts';

interface Dragged {
  kind: 'rule' | 'group';
  id: string;
}
type Over =
  | { kind: 'rule'; id: string; after: boolean }
  | { kind: 'header'; id: string; into: boolean }
  | { kind: 'block'; id: string; after: boolean };
interface Drag {
  dragged: Dragged;
  over: Over | null;
}
type Handlers = Partial<
  Record<
    'onDragStart' | 'onDragOver' | 'onDrop' | 'onDragEnd',
    (event: DragEvent<HTMLElement>) => void
  >
>;

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

function groupAt(id: string) {
  return ruleStore.state.entries.findIndex(
    (entry) => entry.kind === 'group' && entry.group.id === id,
  );
}

function same(a: Over | null, b: Over | null) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// The handlers of a row, a header or a block, made once for each. They read the drag when they're
// called (`now`), so a row that hasn't drawn again since still moves what's dragged to the right
// place; and they look its place up in the order then, not as it was drawn.
function makeHandlers(
  kind: 'rule' | 'header' | 'block' | 'empty',
  id: string,
  now: { current: Drag | null },
  setDrag: (drag: Drag | null) => void,
): Handlers {
  const hover = (over: Over | null) => {
    const drag = now.current;
    if (drag && !same(drag.over, over)) setDrag({ ...drag, over });
  };
  const start = (dragged: Dragged) => (event: DragEvent<HTMLElement>) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragged.id);
    setDrag({ dragged, over: null });
  };
  const end = () => setDrag(null);

  if (kind === 'rule')
    return {
      onDragStart: start({ kind: 'rule', id }),
      onDragOver(event) {
        const dragged = now.current?.dragged;
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
        const dragged = now.current?.dragged;
        const place = placeOf(id);
        if (!dragged || !place || (dragged.kind === 'rule' && dragged.id === id)) return;
        if (dragged.kind === 'group' && place.group) return;
        event.preventDefault();
        event.stopPropagation();
        const index = place.index + (lower(event) ? 1 : 0);
        if (dragged.kind === 'group') moveGroup(dragged.id, index);
        else moveRule(dragged.id, { group: place.group, index });
      },
      onDragEnd: end,
    };
  if (kind === 'header' || kind === 'empty')
    return {
      onDragStart: kind === 'header' ? start({ kind: 'group', id }) : undefined,
      onDragOver(event) {
        const dragged = now.current?.dragged;
        if (!dragged || dragged.kind === 'group') return;
        event.preventDefault();
        event.stopPropagation();
        hover({ kind: 'header', id, into: kind === 'empty' || lower(event) });
      },
      onDrop(event) {
        const dragged = now.current?.dragged;
        if (!dragged || dragged.kind === 'group') return;
        event.preventDefault();
        event.stopPropagation();
        moveRule(
          dragged.id,
          kind === 'empty' || lower(event)
            ? { group: id, index: 0 }
            : { group: '', index: groupAt(id) },
        );
      },
      onDragEnd: end,
    };
  return {
    onDragOver(event) {
      const dragged = now.current?.dragged;
      if (dragged?.kind !== 'group') return;
      event.preventDefault();
      hover(dragged.id === id ? null : { kind: 'block', id, after: lower(event) });
    },
    onDrop(event) {
      const dragged = now.current?.dragged;
      if (dragged?.kind !== 'group' || dragged.id === id) return;
      event.preventDefault();
      moveGroup(dragged.id, groupAt(id) + (lower(event) ? 1 : 0));
    },
  };
}

// For each row, header and block: where what's dragged would land against it, whether it's what's
// being dragged, and the handlers that move it, the same ones on every draw, so a row draws again
// only when its rule or where it stands in the drag changes (rule-list-item.tsx).
export function useRuleDrag() {
  const [drag, setDrag] = useState<Drag | null>(null);
  const now = useRef<Drag | null>(drag);
  // Once the list has drawn, before any event can reach a row.
  useLayoutEffect(() => {
    now.current = drag;
  });
  const [cache] = useState(() => new Map<string, Handlers>());
  const handlers = (kind: 'rule' | 'header' | 'block' | 'empty', id: string) => {
    const key = `${kind}:${id}`;
    let made = cache.get(key);
    if (!made) {
      made = makeHandlers(kind, id, now, setDrag);
      cache.set(key, made);
    }
    return made;
  };
  const over = drag?.over;
  return {
    rule: (rule: Rule): RowDrag => ({
      drop:
        over?.kind === 'rule' && over.id === rule.id
          ? over.after
            ? 'after'
            : 'before'
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
          : undefined,
      handlers: handlers('block', group.id),
    }),
    empty: (group: Group) => handlers('empty', group.id),
  };
}

export type ListDrag = ReturnType<typeof useRuleDrag>;
