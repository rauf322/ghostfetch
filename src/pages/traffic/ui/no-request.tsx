// What the detail side of the Traffic tab shows with no request open.
import { Empty, EmptyDescription, EmptyTitle } from '../../../shared/ui/kit/empty.tsx';

export function NoRequestSelected() {
  return (
    <Empty>
      <EmptyTitle className="mt-0">Select a request</EmptyTitle>
      <EmptyDescription>
        {'Click a request to see its response, then turn it into a rule with '}
        <b>Mock this response</b>.
      </EmptyDescription>
    </Empty>
  );
}
