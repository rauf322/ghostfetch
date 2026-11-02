// An open request's bodies in the body editor's colours: the response (or why there isn't one),
// and the request's own if it sent one, each under a grey label.
import type { LogEntry } from '../../../../shared/api/index.ts';
import { CodeView } from '../../../../shared/ui/code-editor/index.ts';
import { CardHint } from '../../../../shared/ui/kit/card.tsx';
import { PaneSection } from '../../../../shared/ui/list-detail.tsx';

export function RequestBodies({
  entry,
  pretty,
  requestPretty,
}: {
  entry: LogEntry;
  // The two bodies pretty-printed, or null when they aren't JSON.
  pretty: string | null;
  requestPretty: string | null;
}) {
  return (
    <>
      <PaneSection
        label="Response body"
        level={3}
        aside={
          entry.truncated && <span className="font-normal text-t30">the first 1 MB</span>
        }
      >
        {entry.responseBody ? (
          <CodeView text={pretty ?? entry.responseBody} highlight={pretty !== null} />
        ) : (
          <CardHint className="px-1">
            No body captured (empty, binary, or a streaming response).
          </CardHint>
        )}
      </PaneSection>
      {entry.requestBody && (
        <PaneSection label="Request body" level={3}>
          <CodeView
            text={requestPretty ?? entry.requestBody}
            highlight={requestPretty !== null}
          />
        </PaneSection>
      )}
    </>
  );
}
