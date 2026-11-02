// Buttons: outline, primary, ghost, cell and link, in their states, and one to press.
import { useState } from 'react';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { Cell, FOCUS, HOVER, Output, Row } from '../cell.tsx';

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
        label="Full width, with a row of secondary actions (request detail)"
        className="flex flex-col gap-2"
      >
        <Button variant="primary" size="lg" className="w-full">
          <Icon name="wand" size={14} /> Mock this response
        </Button>
        <div className="grid auto-cols-fr grid-flow-col gap-2">
          <Button size="sm" className="min-w-0 px-2 text-t65">
            <Icon name="rule" size={13} /> Open rule
          </Button>
          <Button size="sm" className="min-w-0 px-2 text-t65">
            <Icon name="copy" size={13} /> Copy URL
          </Button>
          <Button size="sm" className="min-w-0 px-2 text-t65">
            <Icon name="copy" size={13} /> Copy response
          </Button>
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
