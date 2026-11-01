// What to do with an open request: Mock this response, the one big button, and a row of quieter
// ones: copy the URL, the request as a cURL command, and the response's body.
import { ruleFromEntry } from '../../../../shared/api/index.ts';
import type { LogEntry, Rule } from '../../../../shared/api/index.ts';
import { curlCommand } from '../../../../shared/lib/index.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import type { IconName } from '../../../../shared/ui/kit/icon.tsx';
import { notify } from '../../../../shared/ui/kit/toast.tsx';

export function RequestActions({
  entry,
  pretty,
  onMock,
}: {
  entry: LogEntry;
  // The response body pretty-printed, or null when it isn't JSON.
  pretty: string | null;
  onMock: (draft: Rule) => void;
}) {
  async function copy(text: string, what: string) {
    await navigator.clipboard.writeText(text);
    notify(`Copied ${what}`);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="primary"
        size="lg"
        data-testid="mock"
        className="h-11 w-full rounded-lg text-body"
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
      <div className="grid auto-cols-fr grid-flow-col gap-1.5">
        <Secondary icon="link" onClick={() => copy(entry.url, 'the URL')}>
          Copy URL
        </Secondary>
        <Secondary
          icon="terminal"
          onClick={() =>
            copy(
              curlCommand({
                method: entry.method,
                url: entry.url,
                body: entry.requestBody,
              }),
              'a cURL command',
            )
          }
        >
          Copy as cURL
        </Secondary>
        {entry.responseBody && (
          <Secondary
            icon="copy"
            onClick={() => copy(pretty ?? entry.responseBody, 'the response body')}
          >
            Copy body
          </Secondary>
        )}
      </div>
    </div>
  );
}

function Secondary({
  icon,
  onClick,
  children,
}: {
  icon: IconName;
  onClick: () => void;
  children: string;
}) {
  return (
    <Button onClick={onClick} className="h-9 min-w-0 gap-1.5 px-1.5 text-t80">
      <Icon name={icon} size={14} className="flex-none" />
      <span className="truncate">{children}</span>
    </Button>
  );
}
