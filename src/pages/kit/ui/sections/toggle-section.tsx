// Toggles and the signal dot, in their states: the bar over Traffic's log, the Vim keys toggle, and
// the dot that says something is live (a rule answering, requests being recorded) but switches
// nothing: the toolbar popup does that. A button lights one dot, so the kit test can watch a dot
// that lights up late pulse in step with the others.
import { useState } from 'react';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { SignalDot } from '../../../../shared/ui/kit/signal-dot.tsx';
import { Toggle } from '../../../../shared/ui/kit/toggle.tsx';
import { Cell, Row } from '../cell.tsx';

export function ToggleSection() {
  const [vim, setVim] = useState(true);
  const [lit, setLit] = useState(false);
  return (
    <Cell title="Toggle and signal" note="green means on">
      <Row
        label="Traffic's bar: Recording, Keep on reload off, the same with the pointer over it, Clear"
        className="flex items-center gap-1.5"
      >
        <span className="flex items-center gap-1.5 px-1.5 text-control font-medium text-signal">
          <SignalDot on />
          Recording
        </span>
        <Toggle className="border-input">Keep on reload</Toggle>
        <Toggle className="border-input bg-pressed text-foreground">
          Keep on reload
        </Toggle>
        <Button>
          <Icon name="trash" size={14} /> Clear
        </Button>
      </Row>
      <Row label="Vim keys off · on (live: Space), the small size">
        <Toggle size="sm" className="border-input">
          Vim keys
        </Toggle>
        <Toggle
          size="sm"
          data-testid="kit-toggle"
          pressed={vim}
          onPressedChange={setVim}
          className="border-input"
        >
          Vim keys
        </Toggle>
      </Row>
      <Row
        label="Signal dot: off (live: the button lights it) · on, pulsing · on, Ghostfetch off"
        className="flex items-center gap-3"
      >
        <SignalDot on={lit} data-testid="kit-signal-off" />
        <SignalDot on data-testid="kit-signal-on" />
        <SignalDot on paused data-testid="kit-signal-paused" />
        <Button size="sm" data-testid="kit-signal-light" onClick={() => setLit(!lit)}>
          {lit ? 'Put it out' : 'Light it'}
        </Button>
      </Row>
    </Cell>
  );
}
