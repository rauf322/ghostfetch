// The New rule button and its menu of the four rule types.
import { useRef } from 'react';
import { TYPES } from '../../../shared/api/index.ts';
import type { RuleType } from '../../../shared/api/index.ts';
import { Button } from '../../../shared/ui/kit/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../shared/ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../shared/ui/kit/icon.tsx';
import { RuleTypeOption } from './rule-type-option.tsx';

export function NewRuleMenu({ onCreate }: { onCreate: (type: RuleType) => void }) {
  // The menu hangs from the toolbar cell around its button, like the other menus.
  const cell = useRef<HTMLDivElement>(null);
  return (
    <div ref={cell} className="flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="primary" data-testid="new-rule" className="mr-2 h-7" />
          }
        >
          <Icon name="plus" size={14} />
          New rule
        </DropdownMenuTrigger>
        <DropdownMenuContent anchor={cell} className="w-[320px]">
          {(Object.keys(TYPES) as RuleType[]).map((type) => (
            <DropdownMenuItem
              key={type}
              data-testid={`new-${type}`}
              onClick={() => onCreate(type)}
              className="items-start gap-3 border-input px-3 py-[11px] text-foreground data-highlighted:text-foreground"
            >
              <RuleTypeOption type={type} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
