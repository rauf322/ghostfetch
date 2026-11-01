// Every icon with its name: the same shapes the body editor's find bar draws from
// src/shared/lib/icons.ts, which test/kit.mjs checks.
import { ICON_NAMES, Icon } from '../../../../shared/ui/kit/icon.tsx';
import { Cell } from '../cell.tsx';

export function IconsSection() {
  return (
    <Cell title="Icons" note="the same shapes as src/shared/lib/icons.ts" wide>
      <div
        data-testid="kit-icons"
        className="grid grid-cols-10 border-t border-l border-border"
      >
        {ICON_NAMES.map((name) => (
          <div
            key={name}
            className="flex flex-col items-center gap-2 border-r border-b border-border py-3 text-t80"
          >
            <Icon name={name} size={18} />
            <span className="text-micro text-t40">{name}</span>
          </div>
        ))}
      </div>
    </Cell>
  );
}
