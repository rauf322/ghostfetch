// "Try a URL": paste a URL and see whether this rule would answer it, decided as the page decides
// it (testResult). The URL stays as you open and close the settings.
import type { Rule } from '../../../../shared/api/index.ts';
import { CardHint } from '../../../../shared/ui/kit/card.tsx';
import { Input } from '../../../../shared/ui/kit/input.tsx';
import { testResult } from '../../lib/rule-checks.ts';
import { Verdict } from './verdict.tsx';

export function UrlTester({
  rule,
  url,
  onUrlChange,
}: {
  rule: Rule;
  url: string;
  onUrlChange: (url: string) => void;
}) {
  const tested = url.trim() ? testResult(rule, url.trim()) : null;
  return (
    <div className="flex flex-col gap-2.5 rounded-lg bg-card p-3">
      <Input
        data-testid="tester"
        aria-label="URL to try"
        placeholder="Paste a URL from the page"
        value={url}
        onChange={(event) => onUrlChange(event.target.value)}
        className="bg-background font-mono placeholder:font-sans"
      />
      {tested ? (
        <Verdict
          tone={tested.tone}
          data-testid="tester-result"
          className="min-w-0 px-0.5 text-foreground data-[tone=good]:text-t80"
        >
          {tested.text}
        </Verdict>
      ) : (
        <CardHint className="px-0.5">See whether this rule would answer it.</CardHint>
      )}
    </div>
  );
}
