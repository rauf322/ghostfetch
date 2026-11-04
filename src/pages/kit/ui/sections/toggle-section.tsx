// Toggles and switches, in their states: the bar over Traffic's log, the Vim keys toggle, a
// switch with its words that a click on either flips (the popup's master switch), and a rule's
// switch in a list, the green dot.
import { useState } from 'react';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { SignalSwitch } from '../../../../shared/ui/kit/signal-switch.tsx';
import { Switch, SwitchPill } from '../../../../shared/ui/kit/switch.tsx';
import { Toggle } from '../../../../shared/ui/kit/toggle.tsx';
import { Cell, FOCUS, Row } from '../cell.tsx';

export function ToggleSection() {
  const [vim, setVim] = useState(true);
  const [on, setOn] = useState(true);
  return (
    <Cell title="Toggle and switch" note="green means on">
      <Row
        label="Traffic's bar: Recording on, Keep on reload off, the same with the pointer over it, Clear"
        className="flex items-center gap-1.5"
      >
        <SwitchPill defaultChecked aria-label="Recording">
          Recording
        </SwitchPill>
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
      <Row label="Switch off · on · small off · small on · disabled · focus">
        <Switch aria-label="Off" />
        <Switch aria-label="On" defaultChecked />
        <Switch size="sm" aria-label="Small off" />
        <Switch size="sm" aria-label="Small on" defaultChecked />
        <Switch aria-label="Disabled" disabled defaultChecked />
        <Switch aria-label="Focused" defaultChecked className={FOCUS} />
      </Row>
      <Row label="Live, with its words: Space, or a click on the switch or the words">
        <label
          data-testid="kit-switch-label"
          className="flex cursor-pointer items-center gap-2 text-small text-t80"
        >
          <Switch data-testid="kit-switch" checked={on} onCheckedChange={setOn} />
          <span data-testid="kit-switch-words">Ghostfetch {on ? 'on' : 'off'}</span>
        </label>
      </Row>
      <Row label="A rule's switch: off · on, pulsing · on, Ghostfetch off · disabled · focus">
        <SignalSwitch aria-label="Off" data-testid="kit-signal-off" />
        <SignalSwitch aria-label="On" defaultChecked data-testid="kit-signal-on" />
        <SignalSwitch
          aria-label="On, paused"
          defaultChecked
          paused
          data-testid="kit-signal-paused"
        />
        <SignalSwitch aria-label="Disabled" disabled defaultChecked />
        <SignalSwitch aria-label="Focused" defaultChecked className={FOCUS} />
      </Row>
    </Cell>
  );
}
