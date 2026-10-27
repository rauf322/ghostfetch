// Empty: what a pane shows with nothing to show, on the dotted grid.
import { Button } from '../../../../shared/ui/kit/button.tsx';
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '../../../../shared/ui/kit/empty.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { Cell } from '../cell.tsx';

export function EmptySection({ index }: { index: number }) {
  return (
    <Cell index={index} title="Empty" note="on the dotted grid" wide>
      <div className="flex h-[230px] border border-border bg-dots">
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
