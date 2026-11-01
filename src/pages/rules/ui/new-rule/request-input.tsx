// New rule's input, after ChatGPT's: a field for a URL or a cURL command, which grows with what you
// paste, and under it the pickers (method, how the URL is compared, status, delay) and the button
// that makes the rule. Enter makes it too; Shift+Enter starts a new line.
import type { RefObject } from 'react';
import { METHODS } from '../../../../shared/api/index.ts';
import type { MatchMode, Method } from '../../../../shared/api/index.ts';
import { statusName } from '../../../../shared/lib/index.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import type { Draft } from '../../lib/rule-draft.ts';
import { URL_LABELS, formatDelay } from '../../lib/rule-summary.ts';
import { Picker } from './picker.tsx';

const METHOD_ITEMS = METHODS.map((method) => ({
  value: method,
  label: method === 'ANY' ? 'Any method' : method,
}));
const MODE_ITEMS = (Object.entries(URL_LABELS) as [MatchMode, string][]).map(
  ([value, label]) => ({ value, label }),
);
// "Server's response" keeps the server's body and status; the codes answer with your body.
const SERVER = 'server';
const STATUS_ITEMS = [
  { value: SERVER, label: "Server's response" },
  ...[200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500, 503].map((code) => ({
    value: String(code),
    label: `${code} ${statusName(code)}`,
  })),
];
const DELAY_ITEMS = [0, 250, 500, 1000, 2000, 5000].map((ms) => ({
  value: String(ms),
  label: ms ? formatDelay(ms) : 'No delay',
}));

// The field is as tall as what's in it, up to 10 rem (a longer command scrolls): by itself where
// the browser has field-sizing (Chrome), at any width; elsewhere, measured as you type.
const SIZES_ITSELF = CSS.supports('field-sizing', 'content');

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
      <textarea
        ref={field}
        data-testid="composer-input"
        aria-label="URL or cURL command"
        rows={1}
        spellCheck={false}
        value={text}
        placeholder="/api/orders, a full URL, or a cURL command"
        onChange={(event) => {
          const box = event.target;
          if (!SIZES_ITSELF) {
            box.style.height = 'auto';
            box.style.height = `${box.scrollHeight}px`;
          }
          onTextChange(box.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing)
            return;
          event.preventDefault();
          onSubmit();
        }}
        className="max-h-40 w-full resize-none bg-transparent px-1.5 pt-1 font-mono text-body leading-relaxed text-foreground outline-none [field-sizing:content] scroll-thin placeholder:font-sans placeholder:text-t30"
      />
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
            value={draft.bodyMode === 'original' ? SERVER : draft.status || '200'}
            items={STATUS_ITEMS}
            onChange={(status) =>
              onDraftChange(
                status === SERVER
                  ? { bodyMode: 'original', status: '' }
                  : { bodyMode: 'replace', status: status === '200' ? '' : status },
              )
            }
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
          className="size-9 flex-none rounded-full text-black hover:text-black"
        >
          <Icon name="send" size={18} />
        </Button>
      </div>
    </div>
  );
}
