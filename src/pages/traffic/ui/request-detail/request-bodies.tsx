// An open request's bodies in the body editor's colours: the response (or why there isn't one),
// and the request's own if it sent one, each under a grey label.
import type { ReactNode } from 'react';
import type { LogEntry } from '../../../../shared/api/index.ts';
import { CodeView } from '../../../../shared/ui/code-editor/index.ts';
import { CardHint } from '../../../../shared/ui/kit/card.tsx';

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
      <Body label="Response body" note={entry.truncated ? 'the first 1 MB' : undefined}>
        {entry.responseBody ? (
          <CodeView text={pretty ?? entry.responseBody} highlight={pretty !== null} />
        ) : (
          <CardHint className="px-1">
            No body captured (empty, binary, or a streaming response).
          </CardHint>
        )}
      </Body>
      {entry.requestBody && (
        <Body label="Request body">
          <CodeView
            text={requestPretty ?? entry.requestBody}
            highlight={requestPretty !== null}
          />
        </Body>
      )}
    </>
  );
}

function Body({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-1 text-label font-medium text-t40">
        {label}
        {note && <span className="ml-2 font-normal text-t30">{note}</span>}
      </h3>
      {children}
    </section>
  );
}
