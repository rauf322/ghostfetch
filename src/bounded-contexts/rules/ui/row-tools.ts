// What every row of the editor's rule list shares rather than mounting its own: one tooltip for
// all the rows' dots, one each for their Turn off and their ⋯, and one ⋯ menu. Base UI's detached
// triggers: the list draws each root and popup once (rule-list.tsx), and a row has only the
// triggers, which pass what they're for (a tooltip's words, the menu its rule's id). A long list
// then mounts a few roots, not a few per row.
import { createContext, useContext } from 'react';
import { createMenuHandle } from '../../../ui/kit/dropdown-menu.tsx';
import type { MenuHandle } from '../../../ui/kit/dropdown-menu.tsx';
import { createTooltipHandle } from '../../../ui/kit/tooltip.tsx';
import type { TooltipHandle } from '../../../ui/kit/tooltip.tsx';

export interface RowTools {
  dot: TooltipHandle;
  turn: TooltipHandle;
  more: TooltipHandle;
  // The ⋯ menu, opened for a rule by its id.
  menu: MenuHandle<string>;
}

export const createRowTools = (): RowTools => ({
  dot: createTooltipHandle(),
  turn: createTooltipHandle(),
  more: createTooltipHandle(),
  menu: createMenuHandle<string>(),
});

export const RowToolsContext = createContext<RowTools | null>(null);

export function useRowTools() {
  const tools = useContext(RowToolsContext);
  if (!tools) throw new Error('A rule row is drawn inside the rule list');
  return tools;
}
