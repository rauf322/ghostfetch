// What every request row of Traffic's list shares rather than mounting its own: one tooltip for
// all the rows' Mock this response, one for their Copy URL and one for their Copy as cURL (Base
// UI's detached triggers, as the editor's rule rows have theirs, rules/ui/row-tools.ts), which the
// list draws once (traffic-list.tsx); and Mock this response itself, the same for every row.
import { createContext, useContext } from 'react';
import type { LogEntry } from '../index.ts';
import { createTooltipHandle } from '../../../ui/kit/tooltip.tsx';
import type { TooltipHandle } from '../../../ui/kit/tooltip.tsx';
import { ROW_ACTIONS } from './entry-actions.ts';
import type { EntryAction } from './entry-actions.ts';

// Each kind of action's tooltip.
export type RowTips = Map<EntryAction, TooltipHandle>;
export const createRowTips = (): RowTips =>
  new Map(ROW_ACTIONS.map((action) => [action, createTooltipHandle()]));

export interface RowTools {
  tips: RowTips;
  // Mock this response, for a row's request.
  mock: (entry: LogEntry) => void;
}

export const RowToolsContext = createContext<RowTools | null>(null);

export function useRowTools() {
  const tools = useContext(RowToolsContext);
  if (!tools) throw new Error("A request row is drawn inside Traffic's list");
  return tools;
}
