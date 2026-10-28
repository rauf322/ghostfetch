// Dragging a rule to a new place in the list. The order is the rules' priority: response rules are
// tried top to bottom and the first match wins.
import { useState } from 'react';
import type { DragEvent } from 'react';
import { moveRule } from '../../../shared/api/index.ts';
import type { Rule } from '../../../shared/api/index.ts';

// A rule being dragged to a new place, and where it would land.
interface Drag {
  id: string;
  over: string | null;
  after: boolean;
}

// What a rule's row gets from useRuleDrag().
export type RowDrag = ReturnType<ReturnType<typeof useRuleDrag>>;

// For each rule's row: where a dragged rule would land against it ('before' or 'after'), whether
// it's the one being dragged, and the handlers that move it.
export function useRuleDrag(rules: Rule[]) {
  const [drag, setDrag] = useState<Drag | null>(null);
  return (rule: Rule) => ({
    drop:
      drag?.over === rule.id
        ? drag.after
          ? ('after' as const)
          : ('before' as const)
        : undefined,
    dragging: drag?.id === rule.id,
    handlers: {
      onDragStart(event: DragEvent<HTMLElement>) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', rule.id);
        setDrag({ id: rule.id, over: null, after: false });
      },
      onDragOver(event: DragEvent<HTMLElement>) {
        if (!drag) return;
        event.preventDefault();
        const box = event.currentTarget.getBoundingClientRect();
        const after = event.clientY > box.top + box.height / 2;
        const over = rule.id === drag.id ? null : rule.id;
        if (over !== drag.over || after !== drag.after) setDrag({ ...drag, over, after });
      },
      onDrop(event: DragEvent<HTMLElement>) {
        if (!drag || rule.id === drag.id) return;
        event.preventDefault();
        const index = rules.indexOf(rule);
        moveRule(drag.id, drag.after ? index + 1 : index);
      },
      onDragEnd() {
        setDrag(null);
      },
    },
  });
}
