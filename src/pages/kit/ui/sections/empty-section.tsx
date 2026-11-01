// Empty: what a pane shows with nothing to show.
import { Button } from '../../../../shared/ui/kit/button.tsx';
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '../../../../shared/ui/kit/empty.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { Cell } from '../cell.tsx';

export function EmptySection() {
  return (
    <Cell title="Empty" note="on the canvas" wide>
      <div className="flex h-[230px] rounded-lg border border-border">
        <Empty>
          <EmptyMedia>
            <img src="/icons/icon128.png" width={48} height={48} alt="" />
          </EmptyMedia>
          <EmptyTitle>Select a rule to edit it</EmptyTitle>
          <EmptyDescription>
            Rules apply on every site Ghostfetch runs on while it's switched on. The
            quickest start: open <b>Traffic</b>, click a request and choose{' '}
            <b>Mock this response</b>.
          </EmptyDescription>
          <Button variant="primary">
            <Icon name="plus" size={14} /> New rule
          </Button>
        </Empty>
      </div>
    </Cell>
  );
}
