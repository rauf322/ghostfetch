// The body a rule answers with: Replace (your body, without calling the server) or Keep server's
// body, and for Replace the Content-Type and the body editor. Over the editor, once there's a
// server's response to compare the body with, the row that turns Diff on and off, with how many
// lines the body adds and takes out (diff-row.tsx); under it, what the check found (a mistake is
// marked in the editor too, and clicking it here puts the cursor there), Copy (the body as the
// editor has it, saying "Copied" in itself for a second, CopyButton), the Wrap and Vim switches,
// and Format. The editor sizes its own text, with Cmd/Ctrl and =, - or 0. Wrap shows a long line
// on as many rows as it takes, as Neovim does, rather than one that scrolls along: the body itself
// stays as it is.
//
// Diff shows, in the editor's place, what your body changes in the server's response (the one the
// rule was made from, or the editor saw since): side by side, or inline when asked or when the card
// is narrower than SIDE_BY_SIDE. A rule with no response yet has neither the row nor Diff. It's a
// view, not an editor: clicking a line, Format, or going to a mistake turns it off and puts you in
// the body there, and a key that would type says so. The editor stays on the page under it, with
// its undo history and vim's state. The row's counts and Diff are one diff (useTextDiff()): made
// as the body is while Diff shows, and while it doesn't, again once typing pauses, so a key typed
// in a long body doesn't diff all of it.
//
// How tall the editor is: beside the settings (a pane 760 px wide or more, `pane-wide:`), as tall
// as the pane has room for, whatever the body; under them, as tall as the body, but never taller
// than the pane (100cqh: the rule editor's pane is a size container) less the room the card's
// controls take in a side panel (122 px, 40 more with the row over the editor, and 32 more while
// its footer is two rows), so all of it is on screen once you scroll to it. code-editor.css reads
// both, and code-diff.css the same for Diff.
//
// The footer: what the check found, then Copy, Wrap, Vim keys and Format. Where beside the buttons
// what the check found wouldn't have the room "Valid JSON · 99 lines" takes in the font in use (a
// side panel, or a wide type), it has a row of its own and the buttons go under it, at its right.
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { BodyMode } from '../../../../shared-kernel/index.ts';
import {
  BODY_MODES,
  editRule,
  responseStore,
  saveRulesNow,
  serverResponse,
} from '../../index.ts';
import type { Rule } from '../../index.ts';
import { systemClipboard } from '../../infrastructure/clipboard.ts';
import { formatJson } from '../../../../lib/index.ts';
import { useStore } from '../../../../ui/use-store.ts';
import { cn } from '../../../../ui/cn.ts';
import {
  CodeDiff,
  CodeEditor,
  diffLayoutPreferred,
  diffPreferred,
  rememberDiff,
  rememberDiffLayout,
  useTextDiff,
  vimPreferred,
  wrapPreferred,
} from '../../../body-editor/index.ts';
import type { CodeEditorHandle, DiffLayout } from '../../../body-editor/index.ts';
import { Button } from '../../../../ui/kit/button.tsx';
import { Card } from '../../../../ui/kit/card.tsx';
import { CopyButton } from '../../../../ui/kit/copy-button.tsx';
import { Icon } from '../../../../ui/kit/icon.tsx';
import { Input } from '../../../../ui/kit/input.tsx';
import { Segmented, SegmentedItem } from '../../../../ui/kit/segmented.tsx';
import { notify } from '../../../../ui/kit/toast.tsx';
import { Toggle } from '../../../../ui/kit/toggle.tsx';
import { Tooltip } from '../../../../ui/kit/tooltip.tsx';
import type { CodeStatus } from '../rule-checks.ts';
import { useWide } from '../use-wide.ts';
import { DiffRow } from './diff-row.tsx';
import { ResponseTitle } from './response-title.tsx';
import { Verdict } from './verdict.tsx';

// How wide the card has to be for Diff side by side, two panes of lines.
const SIDE_BY_SIDE = 480;

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
  const card = useRef<HTMLElement>(null);
  const code = useRef<CodeEditorHandle | null>(null);
  // The Vim and Wrap switches and Diff are each one setting for every body, which they remember.
  const [vim, setVim] = useState(vimPreferred);
  const [wrap, setWrap] = useState(wrapPreferred);
  const [diff, setDiff] = useState(diffPreferred);
  const [layout, setLayout] = useState(diffLayoutPreferred);
  // The line Diff opens at: the one the editor was showing.
  const [fromLine, setFromLine] = useState(0);
  // A key that would type was pressed in Diff, which says so.
  const [typed, setTyped] = useState(false);
  const wide = useWide(card, SIDE_BY_SIDE);
  useStore(responseStore);
  const server = serverResponse(rule.id);
  const { response } = rule;
  const problem = status?.problem ?? null;
  const bad = status?.tone === 'bad';
  const replaces = response.bodyMode === 'replace';
  // Diff, in the editor's place: once there's a server's response to compare the body with.
  const comparing = replaces && diff && server !== null;
  // What the body changes in it, for the row's counts and Diff.
  const changes = useTextDiff(
    replaces && server ? server.body : null,
    response.body,
    comparing,
  );
  // Whether the footer is two rows (its buttons under what the check found), as it lays itself out
  // by what it has to say and the room it has: the editor leaves room for the second row. Watched
  // from the footer's ref, for as long as it's on the page (Replace's, not Keep server's body's).
  const [twoRows, setTwoRows] = useState(false);
  const watchFooter = useCallback((element: HTMLDivElement | null) => {
    if (!element) return undefined;
    // One row is 32 px tall; two, 64.
    const measure = () => setTwoRows(element.offsetHeight > 48);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  function switchDiff(on: boolean) {
    if (on) setFromLine(code.current?.topLine ?? 0);
    setDiff(on);
    rememberDiff(on);
    setTyped(false);
  }
  // Out of Diff, back in the editor, before what comes next uses it.
  function stopComparing() {
    if (comparing) flushSync(() => switchDiff(false));
  }

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
    stopComparing();
    const editor = code.current;
    if (!editor) return;
    const formatted = formatJson(editor.value);
    if (formatted === null)
      return notify("Can't format", {
        kind: 'error',
        description: "The body isn't valid JSON.",
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

  function switchWrap(on: boolean) {
    setWrap(on);
    code.current?.setWrap(on);
    code.current?.textarea.focus({ preventScroll: true });
  }

  function editAt(offset: number) {
    stopComparing();
    code.current?.reveal(offset);
  }

  function pickLayout(next: DiffLayout) {
    setLayout(next);
    rememberDiffLayout(next);
  }

  const note = typed && (
    <>
      <Icon name="edit" size={13} className="flex-none text-t50" />
      <span className="min-w-0 flex-1 truncate">
        Diff is on, so the body can't be typed in. Click a line to edit it.
      </span>
      <button
        type="button"
        data-testid="diff-off"
        onClick={() => {
          stopComparing();
          code.current?.textarea.focus({ preventScroll: true });
        }}
        className="flex-none font-semibold text-strong hover:underline"
      >
        Turn Diff off
      </button>
    </>
  );

  return (
    <section
      ref={card}
      data-testid="body-card"
      aria-label="Response body"
      className={cn(
        'flex flex-col gap-2',
        replaces && server
          ? twoRows
            ? '[--code-max:calc(100cqh-194px)]'
            : '[--code-max:calc(100cqh-162px)]'
          : twoRows
            ? '[--code-max:calc(100cqh-154px)]'
            : '[--code-max:calc(100cqh-122px)]',
        'pane-wide:[--code-fill:100%] pane-wide:[--code-max:100%]',
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
            <Tooltip key={mode} label={BODY_MODES[mode].desc}>
              <SegmentedItem
                value={mode}
                data-testid={`body-${mode}`}
                className="flex-none px-3"
              >
                {BODY_MODES[mode].option}
              </SegmentedItem>
            </Tooltip>
          ))}
        </Segmented>
        {replaces && (
          <Tooltip label="Content-Type">
            <Input
              size="sm"
              list="content-types"
              aria-label="Content-Type"
              value={response.contentType}
              onChange={(event) =>
                editRule(rule.id, (current) => {
                  current.response.contentType = event.target.value;
                })
              }
              className="min-w-[160px] flex-1 font-mono text-meta"
            />
          </Tooltip>
        )}
      </div>
      {replaces ? (
        <>
          {server && <DiffRow diff={changes} on={comparing} onToggle={switchDiff} />}
          <CodeEditor
            key={revision}
            ref={code}
            value={response.body}
            fit
            problem={problem}
            // Vim's Space s and :w: the rule saved at once, rather than a moment after the last
            // edit (the editor formats the body first for Space s).
            onSave={saveRulesNow}
            // Vim's p pastes what's on the clipboard, once the browser lets Ghostfetch read it.
            clipboard={systemClipboard}
            // Back at this rule, or after a change made elsewhere, the body is where it was.
            placeKey={rule.id}
            onChange={(text) =>
              editRule(rule.id, (current) => {
                current.response.body = text;
              })
            }
            // The sizes above reach the editor by name (code-editor.css), not by inheritance,
            // which would carry them into everything in it on each change.
            className={cn(
              'flex min-h-0 flex-1 flex-col [--code-fill:inherit] [--code-max:inherit]',
              comparing && 'hidden',
            )}
          />
          {comparing && changes && (
            <div className="flex min-h-0 flex-1 flex-col [--code-fill:inherit] [--code-max:inherit]">
              <CodeDiff
                diff={changes}
                layout={wide ? layout : 'inline'}
                beforeTitle={<ResponseTitle server={server} compact={!wide} />}
                afterTitle={<span className="flex-none text-strong">Your body</span>}
                note={note}
                fromLine={fromLine}
                onEdit={editAt}
                onType={() => setTyped(true)}
              />
            </div>
          )}
          {/* What the check found, then the buttons, together: beside it where there's room for
              both, else on a row of their own under it, at its right. It asks for the room of
              "Valid JSON · 99 lines" in the font in use (those words, drawn unseen by CSS, size it,
              out of its text), whatever it says: a longer message is cut, whole in its title, rather
              than make the footer two rows as it comes and goes. */}
          <div
            ref={watchFooter}
            className="flex min-h-8 flex-wrap items-center justify-end gap-x-1.5 gap-y-1"
          >
            <Verdict
              tone={status?.tone}
              data-testid="code-status"
              title={status?.text}
              className={cn(
                'min-h-8 min-w-0 flex-auto px-1',
                bad ? 'text-foreground' : 'text-t50',
              )}
            >
              <span className="grid min-w-0 grid-cols-[minmax(0,auto)] overflow-hidden">
                <span
                  aria-hidden="true"
                  data-room="Valid JSON · 99 lines"
                  className="invisible col-start-1 row-start-1 whitespace-nowrap before:content-[attr(data-room)]"
                />
                {problem ? (
                  <button
                    type="button"
                    data-testid="code-problem"
                    onClick={() => {
                      stopComparing();
                      code.current?.reveal(problem.from);
                    }}
                    className="col-start-1 row-start-1 w-0 min-w-full truncate text-left decoration-t40 underline-offset-3 hover:underline"
                  >
                    {status?.text}
                  </button>
                ) : (
                  <span className="col-start-1 row-start-1 w-0 min-w-full truncate">
                    {status?.text}
                  </span>
                )}
              </span>
            </Verdict>
            <div className="flex items-center gap-1.5">
              {comparing && wide && (
                <Segmented
                  aria-label="Diff layout"
                  value={layout}
                  onValueChange={(next) => pickLayout(next as DiffLayout)}
                  className="flex-none"
                >
                  <Tooltip label="Side by side">
                    <SegmentedItem
                      value="split"
                      data-testid="diff-split"
                      aria-label="Side by side"
                      className="flex-none px-2"
                    >
                      <Icon name="split" size={14} />
                    </SegmentedItem>
                  </Tooltip>
                  <Tooltip label="Inline, one under the other">
                    <SegmentedItem
                      value="inline"
                      data-testid="diff-inline"
                      aria-label="Inline"
                      className="flex-none px-2"
                    >
                      <Icon name="stack" size={14} />
                    </SegmentedItem>
                  </Tooltip>
                </Segmented>
              )}
              <CopyButton
                variant="ghost"
                size="sm"
                icon="copy"
                text={() => code.current?.value ?? response.body}
                what="the body"
                data-testid="copy-rule-body"
                className="border-input"
              >
                Copy
              </CopyButton>
              <Tooltip label="Long lines on as many rows as they take">
                <Toggle
                  size="sm"
                  data-testid="wrap"
                  pressed={wrap}
                  onPressedChange={switchWrap}
                  className="border-input"
                >
                  Wrap
                </Toggle>
              </Tooltip>
              <Tooltip label="Vim keys in the body editor">
                <Toggle
                  size="sm"
                  data-testid="vim"
                  pressed={vim}
                  onPressedChange={switchVim}
                  className="border-input"
                >
                  Vim keys
                </Toggle>
              </Tooltip>
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
