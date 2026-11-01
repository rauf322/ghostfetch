// "Respond with": what a rule changes about the response besides its body. A row each for the
// status code, the delay and the headers; a click opens the row's editor.
import type { Rule } from '../../../../shared/api/index.ts';
import { CardHint } from '../../../../shared/ui/kit/card.tsx';
import { formatDelay, headersValue, statusValue } from '../../lib/rule-summary.ts';
import { DelayPanel } from './delay-panel.tsx';
import { HeaderRows } from './header-rows.tsx';
import { SettingRow, SettingsCard } from './settings-card.tsx';
import { StatusPanel } from './status-panel.tsx';

export function ResponseSettings({
  rule,
  open,
  onOpenChange,
}: {
  rule: Rule;
  open: string | null;
  onOpenChange: (id: string | null) => void;
}) {
  const { response } = rule;
  return (
    <SettingsCard open={open} onOpenChange={onOpenChange}>
      <SettingRow
        id="status"
        icon="hash"
        label="Status"
        value={statusValue(rule)}
        quiet={!response.status.trim()}
      >
        <StatusPanel rule={rule} />
      </SettingRow>
      <SettingRow
        id="delay"
        icon="timer"
        label="Delay"
        value={response.delay ? formatDelay(response.delay) : 'None'}
        quiet={!response.delay}
      >
        <DelayPanel rule={rule} />
      </SettingRow>
      <SettingRow
        id="headers"
        icon="list"
        label="Headers"
        value={headersValue(rule)}
        quiet={!response.headers.length}
      >
        <CardHint>Set or remove headers on the response the page gets.</CardHint>
        <HeaderRows rule={rule} pick={(current) => current.response.headers} />
      </SettingRow>
    </SettingsCard>
  );
}
