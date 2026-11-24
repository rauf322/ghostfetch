// URLs cut in the middle (MiddleTruncate), in boxes as narrow as a side panel's rows and
// narrower: a long one keeps its end after the ellipsis; a short one is whole; one shorter than an
// end is all end, with no head; in less room than its end, the end gives way too and nothing
// leaves the box; and a button holding a GraphQL rule's URL, which a screen reader names with it
// whole. Select one and copy it: the text as it is, in one piece.
import { MiddleTruncate } from '../../../../ui/kit/middle-truncate.tsx';
import { Cell, Row } from '../cell.tsx';

// test/kit.mjs looks for this one, and its end.
const LONG_URL = '/api/search?q=invoices&page=2&sort=-created_at';
const BOX = 'rounded-md border border-border px-2 py-1.5 font-mono text-meta text-t65';

export function MiddleTruncateSection() {
  return (
    <Cell title="URL cut in the middle" note="the end stays, after the ellipsis" wide>
      <Row
        label="Long, in 220 px · short · shorter than an end · in 64 px, less than its end · in a button"
        className="flex items-start gap-6"
      >
        <div className={`w-[220px] ${BOX}`}>
          <MiddleTruncate text={LONG_URL} data-testid="kit-middle-long" />
        </div>
        <div className={`w-[160px] ${BOX}`}>
          <MiddleTruncate text="/api/search?q=inv" data-testid="kit-middle-short" />
        </div>
        <div className={`w-[100px] ${BOX}`}>
          <MiddleTruncate text="/graphql" data-testid="kit-middle-bare" />
        </div>
        <div className={`w-16 ${BOX}`}>
          <MiddleTruncate text={LONG_URL} data-testid="kit-middle-tight" />
        </div>
        <button
          type="button"
          data-testid="kit-middle-button"
          className={`w-[160px] text-left hover:bg-pressed ${BOX}`}
        >
          <MiddleTruncate text="/graphql GetInvoices" />
        </button>
      </Row>
    </Cell>
  );
}
