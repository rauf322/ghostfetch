// What to do with an open request: Mock this response, and a row of quieter ones: open the rule
// that fired, copy the URL, copy the response.
import { ruleFromEntry } from '../../../../shared/api/index.ts';
import type { LogEntry, Rule } from '../../../../shared/api/index.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { notify } from '../../../../shared/ui/kit/toast.tsx';

// The row of secondary actions under Mock this response: small outline buttons, side by side.
const SECONDARY = 'min-w-0 px-2 text-t65';

export function RequestActions({
  entry,
  pretty,
  onMock,
  onOpenRule,
}: {
  entry: LogEntry;
  // The response body pretty-printed, or null when it isn't JSON.
  pretty: string | null;
  onMock: (draft: Rule) => void;
  onOpenRule: (id: string) => void;
}) {
  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    notify('Copied to clipboard');
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border px-3.5 py-3">
      <Button
        variant="primary"
        size="lg"
        data-testid="mock"
        className="w-full"
        onClick={() => {
          onMock(ruleFromEntry(entry));
          if (entry.truncated)
            notify('The response was over 1 MB, so the mock only has the first 1 MB', {
              kind: 'error',
              duration: 5000,
            });
        }}
      >
        <Icon name="wand" />
        Mock this response
      </Button>
      <div className="grid auto-cols-fr grid-flow-col gap-2">
        {entry.ruleId && (
          <Button
            size="sm"
            className={SECONDARY}
            onClick={() => onOpenRule(entry.ruleId!)}
          >
            <Icon name="rule" size={13} />
            Open rule
          </Button>
        )}
        <Button size="sm" className={SECONDARY} onClick={() => copy(entry.url)}>
          <Icon name="copy" size={13} />
          Copy URL
        </Button>
        {entry.responseBody && (
          <Button
            size="sm"
            className={SECONDARY}
            onClick={() => copy(pretty ?? entry.responseBody)}
          >
            <Icon name="copy" size={13} />
            Copy response
          </Button>
        )}
      </div>
    </div>
  );
}
