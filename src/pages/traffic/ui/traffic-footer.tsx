// The bar under the log, a row of quiet buttons: Rec (record requests), Preserve (keep them when
// the page reloads), Matched (only the requests a rule matched) and Clear.
import { setFlag } from '../../../shared/api/index.ts';
import { Button } from '../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../shared/ui/kit/icon.tsx';
import { Toggle } from '../../../shared/ui/kit/toggle.tsx';
import { PaneFooter } from '../../../shared/ui/list-detail.tsx';

export function TrafficFooter({
  record,
  preserve,
  onPreserveChange,
  onlyMatched,
  onOnlyMatchedChange,
  onClear,
}: {
  record: boolean;
  preserve: boolean;
  onPreserveChange: (on: boolean) => void;
  onlyMatched: boolean;
  onOnlyMatchedChange: (on: boolean) => void;
  onClear: () => void;
}) {
  return (
    <PaneFooter>
      <Toggle
        size="cell"
        pressed={record}
        onPressedChange={(on) => setFlag('record', on)}
        title="Capture requests. Rules apply either way."
      >
        Rec
      </Toggle>
      <Toggle
        size="cell"
        pressed={preserve}
        onPressedChange={onPreserveChange}
        title="Keep requests when the page reloads"
      >
        Preserve
      </Toggle>
      <Toggle
        size="cell"
        pressed={onlyMatched}
        onPressedChange={onOnlyMatchedChange}
        title="Only show requests a rule matched"
      >
        Matched
      </Toggle>
      <Button
        variant="cell"
        size="cell"
        title="Clear the log"
        className="ml-auto"
        onClick={onClear}
      >
        <Icon name="clear" size={13} />
        Clear
      </Button>
    </PaneFooter>
  );
}
