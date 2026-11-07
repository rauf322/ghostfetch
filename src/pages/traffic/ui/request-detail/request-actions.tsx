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
  onMock: (draft: Rule, entry: LogEntry) => void;
}) {
  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(`Copied ${what}`, { kind: 'success' });
    } catch {
      // The browser kept the clipboard: Firefox's sidebar without focus, or no permission.
      notify(`Couldn't copy ${what}`, {
        kind: 'error',
        description: "The browser didn't allow it.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="primary"
        size="lg"
        data-testid="mock"
        className="h-11 w-full rounded-lg text-body"
        onClick={() => {
          onMock(ruleFromEntry(entry), entry);
          if (entry.truncated)
            notify('The response was over 1 MB', {
              kind: 'error',
              description: 'The mock only has the first 1 MB of it.',
              duration: 6000,
            });
        }}
      >
        <Icon name="wand" />
        Mock this response
      </Button>
      {/* Each as wide as its words, sharing what's left: the three fit a side panel side by
          side, where equal thirds would cut "Copy as cURL" short. */}
      <div className="flex flex-wrap gap-1.5">
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
    <Button size="lg" onClick={onClick} className="flex-auto gap-1.5 px-2 text-t80">
      <Icon name={icon} size={14} className="flex-none" />
      {children}
    </Button>
  );
}
