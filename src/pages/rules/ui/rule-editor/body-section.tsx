// "Response body": how a response rule makes the body (replace, merge, script or keep it), and the
// body editor for the text it uses, with a line saying whether that text is valid, the Vim switch
// and Format.
import { useRef, useState } from 'react';
import { BODY_MODES } from '../../../../shared/api/index.ts';
import type { BodyMode, Rule } from '../../../../shared/api/index.ts';
import { formatJson } from '../../../../shared/lib/index.ts';
import { CodeEditor, vimPreferred } from '../../../../shared/ui/code-editor/index.ts';
import type { CodeEditorHandle } from '../../../../shared/ui/code-editor/index.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Card, CardHint, CardTitle } from '../../../../shared/ui/kit/card.tsx';
import { Segmented, SegmentedItem } from '../../../../shared/ui/kit/segmented.tsx';
import { notify } from '../../../../shared/ui/kit/toast.tsx';
import { Toggle } from '../../../../shared/ui/kit/toggle.tsx';
import { codeStatus } from '../../lib/rule-checks.ts';
import { editRule } from '../../model/edit-rule.ts';
import { Verdict } from './verdict.tsx';

// The body mode's text in the rule, and the language it's written in.
const CODE_FIELDS: Partial<
  Record<BodyMode, { field: 'body' | 'merge' | 'script'; language: 'json' | 'js' }>
> = {
  replace: { field: 'body', language: 'json' },
  merge: { field: 'merge', language: 'json' },
  script: { field: 'script', language: 'js' },
};

export function BodySection({
  rule,
  index,
  revision,
}: {
  rule: Rule;
  index: number;
  // Moves when the rules were changed in another view, so the body editor starts over from them.
  revision: number;
}) {
  const code = useRef<CodeEditorHandle | null>(null);
  // The switch is one setting for every body editor, which the editor remembers (setVim()).
  const [vim, setVim] = useState(vimPreferred);
  const { response } = rule;
  const body = CODE_FIELDS[response.bodyMode];
  const status = body ? codeStatus(rule, response[body.field]) : null;

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
    <Card>
      <CardTitle index={index}>Response body</CardTitle>
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
          <SegmentedItem key={mode} value={mode} title={BODY_MODES[mode].desc}>
            {BODY_MODES[mode].short || BODY_MODES[mode].label}
          </SegmentedItem>
        ))}
      </Segmented>
      <CardHint>{BODY_MODES[response.bodyMode].desc}</CardHint>
      {body && (
        <>
          <CodeEditor
            key={`${body.field}:${revision}`}
            ref={code}
            value={response[body.field]}
            language={body.language}
            onChange={(text) =>
              editRule(rule.id, (current) => {
                current.response[body.field] = text;
              })
            }
          />
          <div className="flex min-h-[26px] items-center justify-between gap-2">
            <Verdict
              tone={status?.tone}
              data-testid="code-status"
              className={status?.tone === 'bad' ? 'text-foreground' : 'text-t40'}
            >
              {status?.text}
            </Verdict>
            <span className="ml-auto flex items-center gap-1.5">
              <Toggle
                data-testid="vim"
                pressed={vim}
                onPressedChange={switchVim}
                title="Vim keys in the body editor"
                className="border-input"
              >
                Vim
              </Toggle>
              {response.bodyMode !== 'script' && (
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="format"
                  onClick={format}
                  className="border-input"
                >
                  Format
                </Button>
              )}
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
