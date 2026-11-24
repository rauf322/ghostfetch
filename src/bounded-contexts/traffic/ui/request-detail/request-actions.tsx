// What to do with an open request: Mock this response, the one big button, with the group the rule
// goes into under it once there's a group, and a row of quieter ones: copy the URL, the request as
// a cURL command, and the response's body, each saying in itself that it copied (CopyButton).
import { ruleFromEntry, ruleStore } from '../../../rules/index.ts';
import type { Rule } from '../../../rules/index.ts';
import type { LogEntry } from '../../index.ts';
import { curlCommand } from '../../../../lib/index.ts';
import { useStore } from '../../../../ui/use-store.ts';
import { GroupPicker } from '../../../rules/ui/group-picker.tsx';
import { Button } from '../../../../ui/kit/button.tsx';
import { CopyButton } from '../../../../ui/kit/copy-button.tsx';
import { Icon } from '../../../../ui/kit/icon.tsx';
import { notify } from '../../../../ui/kit/toast.tsx';

export function RequestActions({
  entry,
  pretty,
  ruleGroup,
  onRuleGroupChange,
  onMock,
}: {
  entry: LogEntry;
  // The response body pretty-printed, or null when it isn't JSON.
  pretty: string | null;
  ruleGroup: string;
  onRuleGroupChange: (group: string) => void;
  onMock: (draft: Rule, entry: LogEntry) => void;
}) {
  const { groups } = useStore(ruleStore);
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
      {groups.length > 0 && (
        <div className="flex min-w-0 items-center gap-2 text-meta text-t50">
          Into
          <GroupPicker value={ruleGroup} onChange={onRuleGroupChange} />
        </div>
      )}
      {/* Each as wide as its words, sharing what's left: the three fit a side panel side by
          side, where equal thirds would cut "Copy as cURL" short. A copy says so in its button
          for a second ("Copied"), not in a toast. */}
      <div className="flex flex-wrap gap-1.5">
        <CopyButton
          size="lg"
          icon="link"
          text={entry.url}
          what="the URL"
          data-testid="copy-url"
          className={SECONDARY}
        >
          Copy URL
        </CopyButton>
        <CopyButton
          size="lg"
          icon="terminal"
          text={() =>
            curlCommand({ method: entry.method, url: entry.url, body: entry.requestBody })
          }
          what="the cURL command"
          data-testid="copy-curl"
          className={SECONDARY}
        >
          Copy as cURL
        </CopyButton>
        {entry.responseBody && (
          <CopyButton
            size="lg"
            icon="copy"
            text={pretty ?? entry.responseBody}
            what="the response body"
            data-testid="copy-body"
            className={SECONDARY}
          >
            Copy body
          </CopyButton>
        )}
      </div>
    </div>
  );
}

const SECONDARY = 'flex-auto px-2 text-t80';
