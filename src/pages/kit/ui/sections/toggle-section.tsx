// Toggles and switches, in their states: cells in a bar as in Traffic's, the Vim toggle, a
// switch with its words that a click on either flips, and a rule's switch, the green dot.
import { useState } from 'react';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { SignalSwitch } from '../../../../shared/ui/kit/signal-switch.tsx';
import { Switch } from '../../../../shared/ui/kit/switch.tsx';
import { Toggle } from '../../../../shared/ui/kit/toggle.tsx';
import { Cell, FOCUS, Row } from '../cell.tsx';

export function ToggleSection({ index }: { index: number }) {
  const [vim, setVim] = useState(true);
  const [ruleOn, setRuleOn] = useState(true);
  return (
    <Cell index={index} title="Toggle and switch" note="the green square means on">
      <Row
        label="Cells in a bar: Rec on, Preserve off, Matched hover"
        className="flex h-[38px] items-stretch border border-border"
      >
        <Toggle size="cell" className="border-l-0" defaultPressed>
          Rec
        </Toggle>
        <Toggle size="cell">Preserve</Toggle>
        <Toggle size="cell" className="bg-pressed text-foreground">
          Matched
        </Toggle>
        <Button variant="cell" size="cell" className="ml-auto">
          <Icon name="clear" size={13} /> Clear
        </Button>
      </Row>
      <Row label="Vim off · on (live: Space)">
        <Toggle>Vim</Toggle>
        <Toggle data-testid="kit-toggle" pressed={vim} onPressedChange={setVim}>
          Vim
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
          <Switch data-testid="kit-switch" checked={ruleOn} onCheckedChange={setRuleOn} />
          <span data-testid="kit-switch-words">Rule {ruleOn ? 'on' : 'off'}</span>
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
