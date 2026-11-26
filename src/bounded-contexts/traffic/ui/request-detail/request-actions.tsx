// What to do with an open request: Mock this response, the one big button, with the group the rule
// goes into under it once there's a group, and a row of quieter ones: copy the URL, the request as
// a cURL command, and the response's body, each saying in itself that it copied (CopyButton). The
// same actions as its row's and its right-click menu's (entry-actions.ts).
import { ruleStore } from '../../../rules/index.ts';
import type { Rule } from '../../../rules/index.ts';
import type { LogEntry } from '../../index.ts';
import { useStore } from '../../../../ui/use-store.ts';
import { GroupPicker } from '../../../rules/ui/group-picker.tsx';
import { Button } from '../../../../ui/kit/button.tsx';
import { CopyButton } from '../../../../ui/kit/copy-button.tsx';
import { Icon } from '../../../../ui/kit/icon.tsx';
import { COPY_BODY, COPY_CURL, COPY_URL, MOCK, mockEntry } from '../entry-actions.ts';

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
        onClick={() => mockEntry(entry, onMock)}
      >
        <Icon name={MOCK.icon} />
        {MOCK.label}
      </Button>
      {groups.length > 0 && (
        <div className="flex min-w-0 items-center gap-2 text-meta text-t50">
          Into
          <GroupPicker value={ruleGroup} onChange={onRuleGroupChange} />
        </div>
      )}
      {/* Each as wide as its words, sharing what's left: the three fit a side panel side by
          side, where equal thirds would cut "Copy as cURL" short. A copy says so in its button
          for a second ("Copied"), not in a toast, and only in this request's: another opened
          meanwhile has copies of its own (the key). */}
      <div key={entry.id} className="flex flex-wrap gap-1.5">
        <CopyButton
          size="lg"
          icon={COPY_URL.icon}
          text={COPY_URL.text(entry)}
          what={COPY_URL.what}
          data-testid="copy-url"
          className={SECONDARY}
        >
          {COPY_URL.label}
        </CopyButton>
        <CopyButton
          size="lg"
          icon={COPY_CURL.icon}
          text={() => COPY_CURL.text(entry)}
          what={COPY_CURL.what}
          data-testid="copy-curl"
          className={SECONDARY}
        >
          {COPY_CURL.label}
        </CopyButton>
        {entry.responseBody && (
          <CopyButton
            size="lg"
            icon={COPY_BODY.icon}
            text={pretty ?? entry.responseBody}
            what={COPY_BODY.what}
            data-testid="copy-body"
            className={SECONDARY}
          >
            {COPY_BODY.label}
          </CopyButton>
        )}
      </div>
    </div>
  );
}

const SECONDARY = 'flex-auto px-2 text-t80';
