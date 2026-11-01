// What the rule list says when there are no rules yet, in a narrow panel, where New rule isn't
// beside it to say it.
import { ListEmpty } from '../../../shared/ui/list-detail.tsx';

export function NoRulesYet() {
  return (
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
