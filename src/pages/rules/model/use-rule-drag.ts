// Dragging a rule to a new place in the list. The order is the rules' priority: rules are tried
// top to bottom and the first match wins. The list shows the rules that are on and the ones that
// are off as two groups, and a rule moves within its own: dropping it on the other group's rules
// does nothing.
import { useState } from 'react';
import type { DragEvent } from 'react';
import { moveRule } from '../../../shared/api/index.ts';
import type { Rule } from '../../../shared/api/index.ts';

// A rule being dragged to a new place (`enabled`: its group), and where it would land.
interface Drag {
  id: string;
  enabled: boolean;
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
        setDrag({ id: rule.id, enabled: rule.enabled, over: null, after: false });
      },
      onDragOver(event: DragEvent<HTMLElement>) {
        if (!drag || drag.enabled !== rule.enabled) return;
        event.preventDefault();
        const box = event.currentTarget.getBoundingClientRect();
        const after = event.clientY > box.top + box.height / 2;
        const over = rule.id === drag.id ? null : rule.id;
        if (over !== drag.over || after !== drag.after) setDrag({ ...drag, over, after });
      },
      onDrop(event: DragEvent<HTMLElement>) {
        if (!drag || rule.id === drag.id || drag.enabled !== rule.enabled) return;
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
