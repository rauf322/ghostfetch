// What the Rules tab shows with nothing to edit: in the list (a narrow panel, where the editor's
// side is hidden) when there are no rules yet, and in the editor's place when none is open.
import { Button } from '../../../shared/ui/kit/button.tsx';
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '../../../shared/ui/kit/empty.tsx';
import { Icon } from '../../../shared/ui/kit/icon.tsx';
import { ListEmpty } from '../../../shared/ui/list-detail.tsx';

export function NoRulesYet() {
  return (
    // In a narrow panel, where the editor's own empty state is hidden.
    <ListEmpty className="wide:hidden">
      <p>
        <strong>No rules yet.</strong> A rule answers the page's requests with the body,
        status, headers or delay you choose.
      </p>
      {/* Text that ends at a line break is a string, which oxfmt can't split at a space:
          each piece stays one run of text, so it lines up to the pixel as in 0.5.1. */}
      <p className="text-meta leading-[1.55] text-t40">
        Click <b>New rule</b>, or open <b>Traffic</b>
        {', click a request and choose '}
        <b>Mock this response</b>.
      </p>
    </ListEmpty>
  );
}

export function NoRuleSelected({
  hasRules,
  onCreate,
}: {
  hasRules: boolean;
  onCreate: () => void;
}) {
  return (
    <Empty>
      <EmptyMedia>
        <img src="/icons/icon128.png" width={56} height={56} alt="" />
      </EmptyMedia>
      <EmptyTitle>
        {hasRules ? 'Select a rule to edit it' : 'Create your first rule'}
      </EmptyTitle>
      <EmptyDescription>
        A rule answers the page's requests with the body, status, headers or delay you
        choose, on every site Ghostfetch runs on while it's switched on. The quickest
        start: open <b>Traffic</b>
        {', click a request and choose '}
        <b>Mock this response</b>.
      </EmptyDescription>
      <Button variant="primary" data-testid="empty-new-rule" onClick={onCreate}>
        <Icon name="plus" size={14} />
        New rule
      </Button>
    </Empty>
  );
}
