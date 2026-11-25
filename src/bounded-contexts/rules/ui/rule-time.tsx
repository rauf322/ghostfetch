// When a rule last answered on a page ("· now", "· 4m"), after what it did there, in a rule's row
// in the editor's list and in the popup. From the screens' clock (use-now.ts): it draws again by
// itself only when those words change, at most once a minute, and nothing else of the row does.
import { timeAgo } from '../../../lib/index.ts';
import { useNowValue } from '../../../ui/use-now.ts';

// `last`: when the page sent the request the rule last answered, in ms since 1970.
export function RuleTime({ last }: { last: number }) {
  const ago = useNowValue((now) => timeAgo(now - last));
  return (
    <span data-testid="rule-time" className="text-t50">
      {`· ${ago}`}
    </span>
  );
}
