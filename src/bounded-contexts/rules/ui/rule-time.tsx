// When a rule last answered on a page ("· now", "· 4m"), after what it did there, in a rule's row
// in the editor's list and in the popup, and at the end of the open rule's status chip. From the
// screens' clock (use-now.ts): it draws again by itself only when those words change, at most once
// a minute, and nothing else of the row (or the chip) does.
import { timeAgo } from '../../../lib/index.ts';
import { useNowValue } from '../../../ui/use-now.ts';

// `last`: when the page sent the request the rule last answered, in ms since 1970. In grey in a
// row; `quiet` false, in the colour of what's around it (the chip's green).
export function RuleTime({
  last,
  quiet = true,
  testId = 'rule-time',
}: {
  last: number;
  quiet?: boolean;
  testId?: string;
}) {
  const ago = useNowValue((now) => timeAgo(now - last));
  return (
    <span data-testid={testId} className={quiet ? 'text-t50' : undefined}>
      {`· ${ago}`}
    </span>
  );
}
