// The body a rule answers with: Replace (your body, without calling the server) or Keep server's
// body, and for Replace the Content-Type and the body editor. Under the editor, what the check
// found (a mistake is marked in the editor too, and clicking it here puts the cursor there), the
// Diff and Vim switches, and Format. The editor sizes its own text, with Cmd/Ctrl and =, - or 0.
//
// Diff shows, in the editor's place, what your body changes in the server's response (the one the
// rule was made from, or the editor saw since, or one pasted in): side by side, or inline when
// asked or when the card is narrower than SIDE_BY_SIDE. It's a view, not an editor: clicking a
// line, Format, or going to a mistake turns it off and puts you in the body there, and a key that
// would type says so. The editor stays on the page under it, with its undo history and vim's state.
//
// How tall the editor is: beside the settings (a pane 760 px wide or more, `pane-wide:`), as tall
// as the pane has room for, whatever the body; under them, as tall as the body, but never taller
// than the pane (100cqh: the rule editor's pane is a size container), so all of it is on screen
// once you scroll to it. code-editor.css reads both, and code-diff.css the same for Diff.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { flushSync } from 'react-dom';
import {
  BODY_MODES,
  editRule,
  keepServerResponse,
  pastedResponse,
  responseStore,
  serverResponse,
} from '../../../../shared/api/index.ts';
import type { BodyMode, Rule, ServerResponse } from '../../../../shared/api/index.ts';
import { formatJson } from '../../../../shared/lib/index.ts';
import { useStore } from '../../../../shared/react/index.ts';
import { cn } from '../../../../shared/ui/cn.ts';
import {
  CodeDiff,
  CodeEditor,
  diffLayoutPreferred,
  diffPreferred,
  rememberDiff,
  rememberDiffLayout,
  vimPreferred,
} from '../../../../shared/ui/code-editor/index.ts';
import type {
  CodeEditorHandle,
  DiffLayout,
} from '../../../../shared/ui/code-editor/index.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Card } from '../../../../shared/ui/kit/card.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { Input } from '../../../../shared/ui/kit/input.tsx';
import { Segmented, SegmentedItem } from '../../../../shared/ui/kit/segmented.tsx';
import { notify } from '../../../../shared/ui/kit/toast.tsx';
import { Toggle } from '../../../../shared/ui/kit/toggle.tsx';
import type { CodeStatus } from '../../lib/rule-checks.ts';
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
  // The Vim switch and Diff are each one setting for every body, which they remember.
  const [vim, setVim] = useState(vimPreferred);
  const [diff, setDiff] = useState(diffPreferred);
  const [layout, setLayout] = useState(diffLayoutPreferred);
  // The line Diff opens at: the one the editor was showing.
  const [fromLine, setFromLine] = useState(0);
  // A key that would type was pressed in Diff, which says so.
  const [typed, setTyped] = useState(false);
  const [pasting, setPasting] = useState(false);
  const wide = useWide(card, SIDE_BY_SIDE);
  useStore(responseStore);
  const server = serverResponse(rule.id);
  const { response } = rule;
  const problem = status?.problem ?? null;
  const bad = status?.tone === 'bad';
  const replaces = response.bodyMode === 'replace';
  const comparing = replaces && diff;

  function switchDiff(on: boolean) {
    if (on) {
      const textarea = code.current?.textarea;
      const lineHeight = textarea ? parseFloat(getComputedStyle(textarea).lineHeight) : 0;
      setFromLine(lineHeight ? Math.floor(textarea!.scrollTop / lineHeight) : 0);
    }
    setDiff(on);
    rememberDiff(on);
    setTyped(false);
    setPasting(false);
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

  const empty = pasting ? (
    <PastedResponse
      onUse={(text) => {
        keepServerResponse(rule.id, pastedResponse(text));
        setPasting(false);
      }}
      onCancel={() => setPasting(false)}
    />
  ) : (
    <>
      <Icon name="server" size={20} className="text-t40" />
      <span className="text-body font-medium text-foreground">
        No server response yet
      </span>
      <span className="max-w-[300px] leading-relaxed">
        Ghostfetch keeps the server's answer the first time it sees one: turn this rule
        off in the sidebar and reload the page once.
      </span>
      <Button
        size="sm"
        data-testid="paste-response"
        onClick={() => setPasting(true)}
        className="border-input"
      >
        Paste a response
      </Button>
    </>
  );

  return (
    <section
      ref={card}
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
          {comparing && (
            <div className="flex min-h-0 flex-1 flex-col [--code-fill:inherit] [--code-max:inherit]">
              <CodeDiff
                before={server?.body ?? null}
                after={response.body}
                layout={wide ? layout : 'inline'}
                beforeTitle={<ResponseTitle server={server} compact={!wide} />}
                afterTitle={<span className="flex-none text-strong">Your body</span>}
                note={note}
                empty={empty}
                fromLine={fromLine}
                onEdit={editAt}
                onType={() => setTyped(true)}
              />
            </div>
          )}
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
                  onClick={() => {
                    stopComparing();
                    code.current?.reveal(problem.from);
                  }}
                  className="min-w-0 truncate text-left decoration-t40 underline-offset-3 hover:underline"
                >
                  {status?.text}
                </button>
              ) : (
                <span className="min-w-0 truncate">{status?.text}</span>
              )}
            </Verdict>
            {comparing && wide && (
              <Segmented
                aria-label="Diff layout"
                value={layout}
                onValueChange={(next) => pickLayout(next as DiffLayout)}
                className="flex-none"
              >
                <SegmentedItem
                  value="split"
                  data-testid="diff-split"
                  aria-label="Side by side"
                  title="Side by side"
                  className="flex-none px-2"
                >
                  <Icon name="split" size={14} />
                </SegmentedItem>
                <SegmentedItem
                  value="inline"
                  data-testid="diff-inline"
                  aria-label="Inline"
                  title="Inline, one under the other"
                  className="flex-none px-2"
                >
                  <Icon name="stack" size={14} />
                </SegmentedItem>
              </Segmented>
            )}
            <Toggle
              size="sm"
              data-testid="diff-switch"
              pressed={diff}
              onPressedChange={switchDiff}
              title="Compare the body with the server's response"
              className="border-input"
            >
              Diff
            </Toggle>
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

// "Server's response", and when it came and its status: "Nov 6, 16:42 · 200", or when it was
// pasted. In a narrow card, the time for today's or else the day ("16:42 · 200"), the rest on
// hover.
function ResponseTitle({
  server,
  compact,
}: {
  server: ServerResponse | null;
  compact: boolean;
}) {
  const label = (format: (time: number) => string) =>
    server &&
    (server.pasted
      ? `pasted ${format(server.time)}`
      : [format(server.time), server.status, server.truncated && 'the first 1 MB']
          .filter(Boolean)
          .join(' · '));
  const full = label((time) => WHEN.format(time));
  return (
    <>
      <span className="flex-none text-t80">Server's response</span>
      {server && (
        <span
          data-testid="diff-from"
          title={full ?? undefined}
          className="min-w-0 truncate text-t40"
        >
          {compact ? label(shortWhen) : full}
        </span>
      )}
    </>
  );
}
const WHEN = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const TIME = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const DAY = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const shortWhen = (time: number) =>
  new Date(time).toDateString() === new Date().toDateString()
    ? TIME.format(time)
    : DAY.format(time);

// Paste a response: the server's answer copied from anywhere (the browser's network panel, a
// terminal), to compare the body with.
function PastedResponse({
  onUse,
  onCancel,
}: {
  onUse: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  // It opens on a click, to paste in.
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => box.current?.focus(), []);
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-2 text-left">
      <textarea
        ref={box}
        data-testid="paste-response-text"
        aria-label="The server's response"
        placeholder="Paste the server's response here"
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="h-40 w-full resize-none rounded-lg border border-input bg-code p-2.5 font-mono text-[11.5px] text-foreground outline-none focus:border-t50"
      />
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          data-testid="paste-response-use"
          disabled={!text.trim()}
          onClick={() => onUse(text)}
        >
          Compare
        </Button>
      </div>
    </div>
  );
}

// Whether an element is at least `width` wide, as it changes: Diff side by side needs the room.
function useWide(ref: RefObject<HTMLElement | null>, width: number) {
  const [wide, setWide] = useState(true);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(() => setWide(element.clientWidth >= width));
    observer.observe(element);
    setWide(element.clientWidth >= width);
    return () => observer.disconnect();
  }, [ref, width]);
  return wide;
}
