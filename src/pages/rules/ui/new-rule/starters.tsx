// The starters under New rule's input: the answers people mock most (an empty list, a 500, a 404,
// a slow response, a 401). One sets the status, delay and body the rule starts with; clicking it
// again goes back to a plain 200. The URL still comes from the input.
import { cn } from '../../../../shared/ui/cn.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { STARTERS } from '../../lib/rule-draft.ts';
import type { StarterId } from '../../lib/rule-draft.ts';

export function Starters({
  chosen,
  onChoose,
}: {
  chosen: StarterId | null;
  onChoose: (id: StarterId) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {STARTERS.map((starter) => (
        <Button
          key={starter.id}
          data-testid={`starter-${starter.id}`}
          aria-pressed={chosen === starter.id}
          onClick={() => onChoose(starter.id)}
          className={cn(
            'h-9 rounded-full px-3.5 text-t65',
            chosen === starter.id &&
              'border-signal/50 bg-signal-soft text-signal hover:bg-signal-soft hover:text-signal',
          )}
        >
          <Icon name={starter.icon} size={15} />
          {starter.label}
        </Button>
      ))}
    </div>
  );
}
