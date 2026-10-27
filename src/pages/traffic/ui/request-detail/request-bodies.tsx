// An open request's bodies in the body editor's colours: the response (or why there isn't one),
// and the request's own if it sent one.
import type { LogEntry } from '../../../../entities/traffic/index.ts';
import { CodeView } from '../../../../shared/ui/code-editor/index.ts';
import { Card, CardHint, CardTitle } from '../../../../shared/ui/kit/card.tsx';

export function RequestBodies({
  entry,
  canMock,
  pretty,
  requestPretty,
}: {
  entry: LogEntry;
  // A fetch() or XMLHttpRequest call, whose body the page reported.
  canMock: boolean;
  // The two bodies pretty-printed, or null when they aren't JSON.
  pretty: string | null;
  requestPretty: string | null;
}) {
  return (
    <>
      <Card>
        <CardTitle note={entry.truncated ? 'first 1 MB only' : undefined}>
          Response body
        </CardTitle>
        {entry.responseBody ? (
          <CodeView text={pretty ?? entry.responseBody} highlight={pretty !== null} />
        ) : (
          <CardHint>
            {canMock
              ? 'No body captured (empty, binary, or a streaming response).'
              : 'Chrome handled this request directly, so its body isn’t available.'}
          </CardHint>
        )}
      </Card>
      {entry.requestBody && (
        <Card>
          <CardTitle>Request body</CardTitle>
          <CodeView
            text={requestPretty ?? entry.requestBody}
            highlight={requestPretty !== null}
          />
        </Card>
      )}
    </>
  );
}
