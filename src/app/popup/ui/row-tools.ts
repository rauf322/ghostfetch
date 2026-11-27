// What every rule row of the popup's list shares rather than mounting its own: one tooltip for all
// the rows' dots, and one for their Edit this rule. Base UI's detached triggers, as the editor's
// rows have theirs (bounded-contexts/rules/ui/row-tools.ts): the list draws each root and popup
// once (rule-list.tsx), and a row has only the triggers, which pass the tooltip its words.
import { createContext, useContext } from 'react';
import { createTooltipHandle } from '../../../ui/kit/tooltip.tsx';
import type { TooltipHandle } from '../../../ui/kit/tooltip.tsx';

export interface RowTools {
  dot: TooltipHandle;
  edit: TooltipHandle;
}

export const createRowTools = (): RowTools => ({
  dot: createTooltipHandle(),
  edit: createTooltipHandle(),
});

export const RowToolsContext = createContext<RowTools | null>(null);

export function useRowTools() {
  const tools = useContext(RowToolsContext);
  if (!tools) throw new Error("A rule row is drawn inside the popup's rule list");
  return tools;
}
