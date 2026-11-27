// Buttons: outline, primary, ghost, cell and link, in their states, and one to press; and the
// request detail's row of copies, live (CopyButton), which test/kit.mjs presses.
import { useState } from 'react';
import { Button } from '../../../../ui/kit/button.tsx';
import { CopyButton } from '../../../../ui/kit/copy-button.tsx';
import { Icon } from '../../../../ui/kit/icon.tsx';
import { Cell, FOCUS, HOVER, Output, Row } from '../cell.tsx';

// What the kit's Copy URL copies, which test/kit.mjs reads back from the clipboard.
const COPIED_URL = 'https://app.acme.test/api/search?q=invoices&page=2';

export function ButtonSection() {
  const [presses, setPresses] = useState(0);
  return (
    <Cell title="Button" note="outline · primary · ghost · cell · link">
      <Row label="Default · hover · primary · primary hover · ghost · disabled">
        <Button>Import</Button>
        <Button className={HOVER}>Import</Button>
        <Button variant="primary">
          <Icon name="plus" size={14} /> New rule
        </Button>
        <Button variant="primary" className="brightness-110">
          <Icon name="plus" size={14} /> New rule
        </Button>
        <Button variant="ghost">Format</Button>
        <Button disabled>Export</Button>
      </Row>
      <Row label="Small · icon · icon hover · focus · link">
        <Button size="sm">Format</Button>
        <Button variant="ghost" size="icon" aria-label="More">
          <Icon name="more" size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back"
          className="bg-pressed text-foreground"
        >
          <Icon name="back" size={18} />
        </Button>
        <Button className={FOCUS}>Focused</Button>
        <Button variant="link" size="inline">
          open Traffic
        </Button>
      </Row>
      <Row
        label="Full width, with a row of copies (request detail; live: a copy says so in its button)"
        className="flex flex-col gap-2"
      >
        <Button variant="primary" size="lg" className="w-full">
          <Icon name="wand" size={14} /> Mock this response
        </Button>
        <div className="flex flex-wrap gap-1.5">
          <CopyButton
            size="lg"
            icon="link"
            text={COPIED_URL}
            what="the URL"
            data-testid="kit-copy"
            className="flex-auto px-2 text-t80"
          >
            Copy URL
          </CopyButton>
          <CopyButton
            size="lg"
            icon="terminal"
            text={`curl '${COPIED_URL}'`}
            what="the cURL command"
            className="flex-auto px-2 text-t80"
          >
            Copy as cURL
          </CopyButton>
          <CopyButton
            size="lg"
            icon="copy"
            text='{"name":"Mocked"}'
            what="the response body"
            className="flex-auto px-2 text-t80"
          >
            Copy body
          </CopyButton>
        </div>
      </Row>
      <Row label="Live: Enter, Space or a click">
        <Button data-testid="kit-button" onClick={() => setPresses((count) => count + 1)}>
          Press me
        </Button>
        <Output testid="kit-button-presses">
          {presses} {presses === 1 ? 'press' : 'presses'}
        </Output>
      </Row>
    </Cell>
  );
}
