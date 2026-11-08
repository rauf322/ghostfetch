// Dragging a rule to a new place in the list. The order is the rules' priority: rules are tried
// top to bottom and the first match wins, whether the rules dragged past are on or off.
import { useLayoutEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { moveRule } from '../../../shared/api/index.ts';
import type { Rule } from '../../../shared/api/index.ts';

// A rule being dragged to a new place, and where it would land.
interface Drag {
  id: string;
  over: string | null;
  after: boolean;
}

// The drag and the rules as the list last drew them: what a row's handlers read.
interface Now {
  drag: Drag | null;
  rules: Rule[];
}

// What a rule's row gets from useRuleDrag().
export type RowDrag = ReturnType<ReturnType<typeof useRuleDrag>>;

// A rule's row's handlers, made once for it. They read the drag and the rules when they're called
// (`now`), so a row that hasn't drawn again since still moves its rule to the right place.
function rowHandlers(
  id: string,
  now: { current: Now },
  setDrag: (drag: Drag | null) => void,
) {
  return {
    onDragStart(event: DragEvent<HTMLElement>) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
      setDrag({ id, over: null, after: false });
    },
    onDragOver(event: DragEvent<HTMLElement>) {
      const { drag } = now.current;
      if (!drag) return;
      event.preventDefault();
      const box = event.currentTarget.getBoundingClientRect();
      const after = event.clientY > box.top + box.height / 2;
      const over = id === drag.id ? null : id;
      if (over !== drag.over || after !== drag.after) setDrag({ ...drag, over, after });
    },
    onDrop(event: DragEvent<HTMLElement>) {
      const { drag, rules } = now.current;
      if (!drag || id === drag.id) return;
      event.preventDefault();
      const index = rules.findIndex((rule) => rule.id === id);
      moveRule(drag.id, drag.after ? index + 1 : index);
    },
    onDragEnd() {
      setDrag(null);
    },
  };
}

// For each rule's row: where a dragged rule would land against it ('before' or 'after'), whether
// it's the one being dragged, and the handlers that move it, the same ones on every draw, so a
// row draws again only when its rule or where it stands in the drag changes (rule-list-item.tsx).
export function useRuleDrag(rules: Rule[]) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const now = useRef<Now>({ drag, rules });
  // Once the list has drawn, before any event can reach a row.
  useLayoutEffect(() => {
    now.current = { drag, rules };
  });
  const [handlers] = useState(() => new Map<string, ReturnType<typeof rowHandlers>>());
  return (rule: Rule) => {
    let row = handlers.get(rule.id);
    if (!row) {
      row = rowHandlers(rule.id, now, setDrag);
      handlers.set(rule.id, row);
    }
    return {
      drop:
        drag?.over === rule.id
          ? drag.after
            ? ('after' as const)
            : ('before' as const)
          : undefined,
      dragging: drag?.id === rule.id,
      handlers: row,
    };
  };
}
