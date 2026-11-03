// The body a rule answers with: Replace (your body, without calling the server) or Keep server's
// body, and for Replace the Content-Type and the body editor. Under the editor, what the check
// found (a mistake is marked in the editor too, and clicking it here puts the cursor there), the
// Vim switch and Format. The editor sizes its own text, with Cmd/Ctrl and =, - or 0.
//
// How tall the editor is: beside the settings (a pane 760 px wide or more, `pane-wide:`), as tall
// as the pane has room for, whatever the body; under them, as tall as the body, but never taller
// than the pane (100cqh: the rule editor's pane is a size container), so all of it is on screen
// once you scroll to it. code-editor.css reads both.
import { useEffect, useRef, useState } from 'react';
import { BODY_MODES, editRule } from '../../../../shared/api/index.ts';
import type { BodyMode, Rule } from '../../../../shared/api/index.ts';
import { formatJson } from '../../../../shared/lib/index.ts';
import { cn } from '../../../../shared/ui/cn.ts';
import { CodeEditor, vimPreferred } from '../../../../shared/ui/code-editor/index.ts';
import type { CodeEditorHandle } from '../../../../shared/ui/code-editor/index.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Card } from '../../../../shared/ui/kit/card.tsx';
import { Input } from '../../../../shared/ui/kit/input.tsx';
import { Segmented, SegmentedItem } from '../../../../shared/ui/kit/segmented.tsx';
import { notify } from '../../../../shared/ui/kit/toast.tsx';
import { Toggle } from '../../../../shared/ui/kit/toggle.tsx';
import type { CodeStatus } from '../../lib/rule-checks.ts';
import { Verdict } from './verdict.tsx';

export function BodyCard({
  rule,
  revision,
  status,
  focus,
  onFocused,
  className,
}: {
  rule: Rule;
  // Moves when the rules were changed in another view, so the body editor starts over from them.
  revision: number;
  // What the check found, as the editor shows it (useSettledStatus).
  status: CodeStatus | null;
  // Put the cursor in the body, for a rule New rule just made: inside its {} or [] if that's all
  // there is, so you can type the JSON straight away. `onFocused` says it's there.
  focus: boolean;
  onFocused: () => void;
  className?: string;
}) {
  const code = useRef<CodeEditorHandle | null>(null);
  // The Vim switch is one setting for every body editor, which the editor remembers (setVim()).
  const [vim, setVim] = useState(vimPreferred);
  const { response } = rule;
  const problem = status?.problem ?? null;
  const bad = status?.tone === 'bad';
  const replaces = response.bodyMode === 'replace';

  useEffect(() => {
    const textarea = code.current?.textarea;
    if (!focus || !textarea) return;
    const { value } = textarea;
    const blank = value.indexOf('\n  \n');
    const at = blank >= 0 ? blank + 3 : value === '[]' ? 1 : value.length;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(at, at);
    onFocused();
  }, [focus, onFocused]);

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
    <section
      data-testid="body-card"
      aria-label="Response body"
      className={cn(
        'flex flex-col gap-2',
        '[--code-max:calc(100cqh-120px)] pane-wide:[--code-fill:100%] pane-wide:[--code-max:100%]',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          aria-label="Response body"
          value={response.bodyMode}
          onValueChange={(mode) =>
            editRule(rule.id, (current) => {
              current.response.bodyMode = mode as BodyMode;
            })
          }
          className="flex-none"
        >
          {(Object.keys(BODY_MODES) as BodyMode[]).map((mode) => (
            <SegmentedItem
              key={mode}
              value={mode}
              data-testid={`body-${mode}`}
              title={BODY_MODES[mode].desc}
              className="flex-none px-3"
            >
              {BODY_MODES[mode].option}
            </SegmentedItem>
          ))}
        </Segmented>
        {replaces && (
          <Input
            size="sm"
            list="content-types"
            aria-label="Content-Type"
            title="Content-Type"
            value={response.contentType}
            onChange={(event) =>
              editRule(rule.id, (current) => {
                current.response.contentType = event.target.value;
              })
            }
            className="min-w-[160px] flex-1 font-mono text-meta"
          />
        )}
      </div>
      {replaces ? (
        <>
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
            // The sizes above reach the editor by name (code-editor.css), not by inheritance,
            // which would carry them into everything in it on each change.
            className="flex min-h-0 flex-1 flex-col [--code-fill:inherit] [--code-max:inherit]"
          />
          <div className="flex min-h-8 items-center gap-1.5">
            <Verdict
              tone={status?.tone}
              data-testid="code-status"
              title={status?.text}
              className={cn('min-w-0 flex-1 px-1', bad ? 'text-foreground' : 'text-t50')}
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
              size="sm"
              data-testid="vim"
              pressed={vim}
              onPressedChange={switchVim}
              title="Vim keys in the body editor"
              className="border-input"
            >
              Vim keys
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
      ) : (
        <Card className="px-3.5 py-3 text-body leading-relaxed text-t50">
          Ghostfetch lets the request through and passes the server's body on as it is.
          The status, headers and delay you set still apply.
        </Card>
      )}
    </section>
  );
}
