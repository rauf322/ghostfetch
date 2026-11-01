// The Body tab: whether a response rule replaces the body or keeps the server's, and for Replace
// the Content-Type and the body editor, as tall as the body down to the bottom of the pane. Under
// it, what the check found (a mistake is marked in the editor too, and clicking it here puts the
// cursor there), the Vim switch and Format. The editor sizes its own text, with Cmd/Ctrl and =, -
// or 0.
import { useRef, useState } from 'react';
import { BODY_MODES, editRule } from '../../../../shared/api/index.ts';
import type { BodyMode, Rule } from '../../../../shared/api/index.ts';
import { formatJson } from '../../../../shared/lib/index.ts';
import { cn } from '../../../../shared/ui/cn.ts';
import { CodeEditor, vimPreferred } from '../../../../shared/ui/code-editor/index.ts';
import type { CodeEditorHandle } from '../../../../shared/ui/code-editor/index.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { CardHint } from '../../../../shared/ui/kit/card.tsx';
import { Input } from '../../../../shared/ui/kit/input.tsx';
import { FieldLabel } from '../../../../shared/ui/kit/label.tsx';
import { Segmented, SegmentedItem } from '../../../../shared/ui/kit/segmented.tsx';
import { notify } from '../../../../shared/ui/kit/toast.tsx';
import { Toggle } from '../../../../shared/ui/kit/toggle.tsx';
import type { CodeStatus } from '../../lib/rule-checks.ts';
import { Verdict } from './verdict.tsx';

export function BodyPanel({
  rule,
  revision,
  status,
}: {
  rule: Rule;
  // Moves when the rules were changed in another view, so the body editor starts over from them.
  revision: number;
  // What the check found, as the editor shows it (useSettledStatus).
  status: CodeStatus | null;
}) {
  const code = useRef<CodeEditorHandle | null>(null);
  // The Vim switch is one setting for every body editor, which the editor remembers (setVim()).
  const [vim, setVim] = useState(vimPreferred);
  const { response } = rule;
  const problem = status?.problem ?? null;
  const bad = status?.tone === 'bad';

  function format() {
    const editor = code.current;
    if (!editor) return;
    const formatted = formatJson(editor.value);
    if (formatted === null)
      return notify("Can't format: the body isn't valid JSON", {
        kind: 'error',
      });
    if (formatted !== editor.value) editor.replace(formatted);
    return undefined;
  }

  function switchVim(on: boolean) {
    setVim(on);
    code.current?.setVim(on);
    // Straight back into the body, where the keys are.
    code.current?.textarea.focus({ preventScroll: true });
  }

  return (
    <>
      <Segmented
        aria-label="Response body"
        value={response.bodyMode}
        onValueChange={(mode) =>
          editRule(rule.id, (current) => {
            current.response.bodyMode = mode as BodyMode;
          })
        }
      >
        {(Object.keys(BODY_MODES) as BodyMode[]).map((mode) => (
          <SegmentedItem
            key={mode}
            value={mode}
            data-testid={`body-${mode}`}
            title={BODY_MODES[mode].desc}
          >
            {BODY_MODES[mode].label}
          </SegmentedItem>
        ))}
      </Segmented>
      <CardHint>{BODY_MODES[response.bodyMode].desc}</CardHint>
      {response.bodyMode === 'replace' && (
        <>
          <label className="flex min-w-0 items-center gap-2.5">
            <FieldLabel className="flex-none">Content-Type</FieldLabel>
            <Input
              size="sm"
              list="content-types"
              value={response.contentType}
              onChange={(event) =>
                editRule(rule.id, (current) => {
                  current.response.contentType = event.target.value;
                })
              }
              className="flex-1"
            />
          </label>
          <CodeEditor
            key={revision}
            ref={code}
            value={response.body}
            fit
            problem={problem}
            onChange={(text) =>
              editRule(rule.id, (current) => {
                current.response.body = text;
              })
            }
          />
          <div className="flex min-h-[26px] items-center gap-1.5">
            <Verdict
              tone={status?.tone}
              data-testid="code-status"
              title={status?.text}
              className={cn('min-w-0 flex-1', bad ? 'text-foreground' : 'text-t40')}
            >
              {problem ? (
                <button
                  type="button"
                  data-testid="code-problem"
                  onClick={() => code.current?.reveal(problem.from)}
                  className="min-w-0 truncate text-left decoration-t40 underline-offset-3 hover:underline"
                >
                  {status?.text}
                </button>
              ) : (
                <span className="min-w-0 truncate">{status?.text}</span>
              )}
            </Verdict>
            <Toggle
              data-testid="vim"
              pressed={vim}
              onPressedChange={switchVim}
              title="Vim keys in the body editor"
              className="border-input"
            >
              Vim
            </Toggle>
            <Button
              variant="ghost"
              size="sm"
              data-testid="format"
              onClick={format}
              className="border-input"
            >
              Format
            </Button>
          </div>
        </>
      )}
    </>
  );
}
