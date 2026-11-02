// New rule's input, after ChatGPT's: a field for a URL or a cURL command, which grows with what you
// paste, and under it the pickers (method, how the URL is compared, status, delay) and the button
// that makes the rule. Enter makes it too; Shift+Enter starts a new line.
import type { RefObject } from 'react';
import { MATCH_MODES, METHODS } from '../../../../shared/api/index.ts';
import type { MatchMode, Method } from '../../../../shared/api/index.ts';
import { formatDuration, statusLabel } from '../../../../shared/lib/index.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { SERVER_RESPONSE, chooseStatus, statusChoice } from '../../lib/rule-draft.ts';
import type { Draft } from '../../lib/rule-draft.ts';
import { STATUS_GROUPS } from '../../lib/status-codes.ts';
import { Picker } from './picker.tsx';

const METHOD_ITEMS = METHODS.map((method) => ({
  value: method,
  label: method === 'ANY' ? 'Any method' : method,
}));
const MODE_ITEMS = (Object.keys(MATCH_MODES) as MatchMode[]).map((value) => ({
  value,
  label: MATCH_MODES[value].row,
}));
// "Server's response" keeps the server's body and status; the codes answer with your body.
const STATUS_ITEMS = [
  { value: SERVER_RESPONSE, label: "Server's response" },
  ...STATUS_GROUPS.flatMap((group) => group.codes).map((code) => ({
    value: String(code),
    label: statusLabel(code),
  })),
];
const DELAY_ITEMS = [0, 250, 500, 1000, 2000, 5000].map((ms) => ({
  value: String(ms),
  label: ms ? formatDuration(ms) : 'No delay',
}));

export function RequestInput({
  field,
  text,
  draft,
  onTextChange,
  onDraftChange,
  onSubmit,
}: {
  field: RefObject<HTMLTextAreaElement | null>;
  text: string;
  draft: Draft;
  onTextChange: (text: string) => void;
  // A picker's change; the status and the delay are the answer's, so they unpick the starter.
  onDraftChange: (change: Partial<Draft>) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line-strong bg-card p-3 shadow-menu transition-colors duration-150 focus-within:border-t30">
      {/* The field and a hidden copy of its text (::after) share one cell of a grid, so the cell
          is as tall as the text and the field stretches to it, in every browser. The copy wraps
          as the field does only with the field's padding, font and line height, written out on
          both (Tailwind only knows classes it can read whole); it ends with a space, so a last
          empty line counts. Both stop at 10 rem, and a longer command scrolls in the field. */}
      <div
        data-value={`${text} `}
        className="grid after:invisible after:col-start-1 after:row-start-1 after:max-h-40 after:overflow-hidden after:px-1.5 after:pt-1 after:font-mono after:text-body after:leading-relaxed after:break-words after:whitespace-pre-wrap after:content-[attr(data-value)]"
      >
        <textarea
          ref={field}
          data-testid="composer-input"
          aria-label="URL or cURL command"
          rows={1}
          spellCheck={false}
          value={text}
          placeholder="/api/orders, a full URL, or a cURL command"
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing)
              return;
            event.preventDefault();
            onSubmit();
          }}
          className="col-start-1 row-start-1 max-h-40 w-full resize-none bg-transparent px-1.5 pt-1 font-mono text-body leading-relaxed break-words text-foreground outline-none scroll-thin placeholder:font-sans placeholder:text-t30"
        />
      </div>
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          <Picker
            icon="swap"
            label="Method"
            testid="picker-method"
            value={draft.method}
            items={METHOD_ITEMS}
            onChange={(method) => onDraftChange({ method: method as Method })}
          />
          <Picker
            icon="globe"
            label="How the URL is compared"
            testid="picker-mode"
            value={draft.mode}
            items={MODE_ITEMS}
            onChange={(mode) => onDraftChange({ mode: mode as MatchMode })}
          />
          <Picker
            icon="hash"
            label="Status"
            testid="picker-status"
            value={statusChoice(draft)}
            items={STATUS_ITEMS}
            onChange={(status) => onDraftChange(chooseStatus(status))}
          />
          <Picker
            icon="timer"
            label="Delay"
            testid="picker-delay"
            value={String(draft.delay)}
            items={DELAY_ITEMS}
            onChange={(delay) => onDraftChange({ delay: Number(delay) })}
          />
        </div>
        <Button
          variant="primary"
          size="icon"
          data-testid="composer-submit"
          aria-label="Make the rule"
          title="Make the rule (Enter)"
          disabled={!text.trim()}
          onClick={onSubmit}
          className="size-9 flex-none rounded-full text-inverse hover:text-inverse"
        >
          <Icon name="send" size={18} />
        </Button>
      </div>
    </div>
  );
}
