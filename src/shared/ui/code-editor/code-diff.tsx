// The body's Diff: a read-only view of what changed between two texts, the server's response and
// your body, line by line (diffLines), the parts of a changed line that changed marked
// (diffWords), in the body editor's syntax colours and text size. Inline, one column as git shows
// a diff, each line numbered in both texts; or side by side, a pane for each, with a gap on one
// side where the other has lines it hasn't, the two scrolling down together. Only the lines on
// screen are drawn, so a long body opens and scrolls as a short one does. It can't be typed in: a
// click on a line asks to edit there (onEdit, with where in `after` the click was), as Enter does
// for the line at the top, and a key that would type asks to say so (onType). Its look is
// code-diff.css.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode, UIEvent } from 'react';
import { diffLines, diffWords } from '../../lib/index.ts';
import type { DiffKind, Range as Span, TextDiff } from '../../lib/index.ts';
import { cn } from '../cn.ts';
import { Icon } from '../kit/icon.tsx';
import { fontSizePreferred } from './engine/code-editor.ts';
import { tokens } from './engine/highlight.ts';
import './code-editor.css';
import './code-diff.css';

export type DiffLayout = 'split' | 'inline';

// The Diff switch and the layout, each one setting for every body, remembered in this browser like
// the Vim switch.
const DIFF_KEY = 'ghostfetch.diff';
const LAYOUT_KEY = 'ghostfetch.diffLayout';
export const diffPreferred = () => localStorage.getItem(DIFF_KEY) === '1';
export const rememberDiff = (on: boolean) =>
  localStorage.setItem(DIFF_KEY, on ? '1' : '0');
export const diffLayoutPreferred = (): DiffLayout =>
  localStorage.getItem(LAYOUT_KEY) === 'inline' ? 'inline' : 'split';
export const rememberDiffLayout = (layout: DiffLayout) =>
  localStorage.setItem(LAYOUT_KEY, layout);

// As tall as the body editor's lines (code-editor.css).
const LINE_HEIGHT = 1.75;
// The lines drawn past either edge of the screen, so a quick scroll doesn't show them blank.
const OVERSCAN = 30;
// Above and below the lines, as in the body editor; the titles; a note.
const PADDING = 8;
const HEAD = 36;
const NOTE = 38;
const MARKS: Record<DiffKind, string> = { same: '', del: '−', add: '+' };

// A line in a pane: what it is, and its index in its text; a gap where the other pane has a line
// this one hasn't.
interface Cell {
  kind: DiffKind | 'gap';
  line: number;
}
const GAP: Cell = { kind: 'gap', line: -1 };
// A row side by side: a cell in each pane.
interface Pair {
  left: Cell;
  right: Cell;
}
// A row as it's drawn: its kind, its text and the parts of it that changed, its line numbers (two
// inline), and whether a click on it lands in the body's text.
interface RowView {
  row: number;
  kind: DiffKind | 'gap';
  text: string;
  marks: Span[] | null;
  numbers: string[];
  inBody: boolean;
}

interface CodeDiffProps {
  before: string;
  after: string;
  layout: DiffLayout;
  beforeTitle: ReactNode;
  afterTitle: ReactNode;
  // A line across the top, above the lines.
  note?: ReactNode;
  // The line of `after` to show first: the one the body editor was showing.
  fromLine?: number;
  onEdit: (offset: number) => void;
  onType: () => void;
  className?: string;
}

export function CodeDiff({
  before: givenBefore,
  after: givenAfter,
  layout,
  beforeTitle,
  afterTitle,
  note,
  fromLine = 0,
  onEdit,
  onType,
  className,
}: CodeDiffProps) {
  const [fontSize] = useState(fontSizePreferred);
  const rowHeight = fontSize * LINE_HEIGHT;
  // Each text with its line ends as the body editor has them (asTextarea): a body or a response
  // with Windows line ends compares line for line with what's typed, and a click's place in
  // `after` is its place in the editor.
  const before = useMemo(() => asTextarea(givenBefore), [givenBefore]);
  const after = useMemo(() => asTextarea(givenAfter), [givenAfter]);
  const diff = useMemo(() => diffLines(before, after), [before, after]);
  const afterLines = diff.after;
  const marks = useMemo(() => wordMarks(diff), [diff]);
  const split = layout === 'split';
  const pairs = useMemo(() => (split ? pairUp(diff) : []), [split, diff]);
  const count = split ? pairs.length : diff.lines.length;
  // Where each line of `after` starts in it; and for each row, the line of `after` it is or comes
  // before, where a click on it puts the cursor (past the last line: the end).
  const starts = useMemo(() => {
    const out: number[] = [];
    let at = 0;
    for (const line of afterLines) {
      out.push(at);
      at += line.length + 1;
    }
    return out;
  }, [afterLines]);
  const lineAt = useMemo(() => {
    const out = new Int32Array(count + 1);
    out[count] = afterLines.length;
    for (let row = count - 1; row >= 0; row--) {
      const line = split ? pairs[row]!.right.line : diff.lines[row]!.after;
      out[row] = line >= 0 ? line : out[row + 1]!;
    }
    return out;
  }, [count, split, pairs, diff, afterLines]);
  // How wide each pane's lines get, in characters, and its line numbers, in digits.
  const widths = useMemo(() => {
    const widest = (lines: string[]) =>
      lines.reduce((max, line) => Math.max(max, line.length), 0);
    const left = widest(diff.before);
    const right = widest(afterLines);
    return {
      left,
      right,
      inline: Math.max(left, right),
      digits: String(Math.max(afterLines.length, diff.before.length)).length,
    };
  }, [diff, afterLines]);

  // The rows on screen: how far down the lines are scrolled (at first, to the line the editor was
  // showing), and how tall the panes are.
  const [start] = useState(() => firstRowAt(lineAt, count, fromLine) * rowHeight);
  const [top, setTop] = useState(start);
  const [height, setHeight] = useState(800);
  const [panes] = useState(() => createPanes(setHeight));
  // The body's line at the top, as the panes scroll. Each layout has rows of its own (inline one
  // for each line removed and each added, side by side one for each pair), so when the layout
  // changes, or the texts, the panes go to the row that line is at, as Diff opens at the editor's.
  const topLine = useRef(fromLine);
  useLayoutEffect(
    () => panes.scrollTo(firstRowAt(lineAt, count, topLine.current) * rowHeight),
    [panes, lineAt, count, rowHeight],
  );
  useEffect(() => () => panes.disconnect(), [panes]);
  const first = Math.max(0, Math.floor((top - PADDING) / rowHeight) - OVERSCAN);
  const last = Math.min(count, Math.ceil((top + height) / rowHeight) + OVERSCAN);
  // The row at the top: the first whole one.
  const rowAtTop = (scrollTop: number) =>
    Math.min(count, Math.max(0, Math.ceil((scrollTop - PADDING) / rowHeight)));

  function scrolled(event: UIEvent<HTMLElement>) {
    const { scrollTop } = event.currentTarget;
    panes.follow(event.currentTarget);
    setTop(scrollTop);
    topLine.current = lineAt[rowAtTop(scrollTop)]!;
  }

  // Where in `after` the start of a row's line is, or with `column`, that far into it.
  const offsetOf = (row: number, column = 0) => {
    const line = lineAt[Math.min(Math.max(row, 0), count)]!;
    return line >= afterLines.length
      ? after.length
      : starts[line]! + Math.min(column, afterLines[line]!.length);
  };

  // Enter edits at the line at the top; a key that would type, delete, paste or cut says it can't.
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    const command = event.metaKey || event.ctrlKey;
    if (event.key === 'Enter' && !command && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      onEdit(offsetOf(rowAtTop(event.currentTarget.scrollTop)));
      return;
    }
    const types =
      (!command && !event.altKey && event.key.length === 1) ||
      (!command && (event.key === 'Backspace' || event.key === 'Delete')) ||
      (command && !event.altKey && /^[vx]$/i.test(event.key));
    if (!types) return;
    event.preventDefault();
    onType();
  }

  // A click on a line: where in `after` it was. On a line of the body, the character under the
  // pointer; on a removed line or a gap, the start of the body's next line. Not after a drag that
  // selected text, which is for copying.
  function clicked(event: MouseEvent<HTMLElement>) {
    if (window.getSelection()?.toString()) return;
    const element = (event.target as Element).closest('[data-row]');
    if (!element) return;
    const code = element.querySelector('[data-code]');
    const column =
      element.hasAttribute('data-body') && code
        ? columnAt(code, event.clientX, event.clientY)
        : 0;
    onEdit(offsetOf(Number(element.getAttribute('data-row')), column));
  }

  const row = (view: RowView) => (
    <div
      key={view.row}
      data-testid="diff-row"
      data-row={view.row}
      data-kind={view.kind}
      data-body={view.inBody || undefined}
      className="diff-row"
      style={{ top: PADDING + view.row * rowHeight }}
    >
      <span className="diff-gutter">
        {view.numbers.map((number, index) => (
          <span key={index} className="diff-no">
            {number}
          </span>
        ))}
        <span className="diff-mark">{view.kind === 'gap' ? '' : MARKS[view.kind]}</span>
      </span>
      {view.kind !== 'gap' && (
        <>
          <Code text={view.text} marks={view.marks} added={view.kind === 'add'} />
          <span className="diff-edit">
            <Icon name="edit" size={11} />
            Edit here
          </span>
        </>
      )}
    </div>
  );
  const number = (line: number) => (line >= 0 ? String(line + 1) : '');
  const visible: number[] = [];
  for (let index = first; index < last; index++) visible.push(index);
  // A pane of rows: the lines in a box as tall as all of them and as wide as the widest, which the
  // rows on screen are placed in.
  const pane = (
    slot: number,
    label: string,
    testId: string,
    chars: number,
    views: RowView[],
  ) => (
    <div
      ref={panes.ref(slot)}
      // A read-only text box: it takes the focus and scrolls with the keys, and a click on a line
      // or Enter goes to edit the body there. The linter would have a <textarea>, which can't draw
      // only the lines on screen, or mark the parts that changed.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a view of lines drawn as they show
      role="textbox"
      aria-readonly="true"
      aria-multiline="true"
      aria-label={label}
      tabIndex={0}
      data-testid={testId}
      className="diff-pane scroll-thin"
      onScroll={scrolled}
      onKeyDown={keyDown}
      onClick={clicked}
    >
      <div
        className="diff-lines"
        style={
          { height: count * rowHeight + 2 * PADDING, '--chars': chars } as CSSProperties
        }
      >
        {views.map(row)}
      </div>
    </div>
  );

  let body: ReactNode;
  if (!split) {
    body = pane(
      0,
      'Diff of the body against the server response',
      'diff-pane',
      widths.inline,
      visible.map((index) => {
        const line = diff.lines[index]!;
        const removed = line.kind === 'del';
        return {
          row: index,
          kind: line.kind,
          text: removed ? diff.before[line.before]! : afterLines[line.after]!,
          marks: marks(line.kind, removed ? line.before : line.after),
          numbers: [number(line.before), number(line.after)],
          inBody: !removed,
        };
      }),
    );
  } else {
    const cells = (side: 'left' | 'right', texts: string[]) =>
      visible.map((index): RowView => {
        const cell = pairs[index]![side];
        return {
          row: index,
          kind: cell.kind,
          text: cell.line >= 0 ? texts[cell.line]! : '',
          marks: cell.kind === 'gap' ? null : marks(cell.kind, cell.line),
          numbers: [number(cell.line)],
          inBody: cell.kind !== 'gap' && (side === 'right' || cell.kind === 'same'),
        };
      });
    body = (
      <>
        {pane(
          0,
          "Server's response",
          'diff-pane-before',
          widths.left,
          cells('left', diff.before),
        )}
        {pane(
          1,
          'Your body',
          'diff-pane-after',
          widths.right,
          cells('right', afterLines),
        )}
      </>
    );
  }

  const counts = (
    <span data-testid="diff-counts" className="diff-counts">
      <span className="diff-added">+{diff.added}</span>
      <span className="diff-removed">−{diff.removed}</span>
    </span>
  );
  // As tall as the lines, within the room the page gives the body (--code-max), as the body
  // editor is (code-diff.css).
  const fit = HEAD + (note ? NOTE : 0) + count * rowHeight + 2 * PADDING + 2;
  return (
    <div
      data-testid="diff"
      data-layout={layout}
      className={cn('code-diff', className)}
      style={
        {
          fontSize: `${fontSize}px`,
          '--row': `${rowHeight}px`,
          '--digits': widths.digits,
          '--diff-fit': `${Math.ceil(fit)}px`,
        } as CSSProperties
      }
    >
      {split ? (
        <div className="diff-head diff-head-split">
          <div>{beforeTitle}</div>
          <div>
            {afterTitle}
            {counts}
          </div>
        </div>
      ) : (
        <div className="diff-head">
          {beforeTitle}
          <Icon name="arrow" size={12} className="diff-arrow" />
          {afterTitle}
          {counts}
        </div>
      )}
      {note && (
        <div data-testid="diff-note" className="diff-note">
          {note}
        </div>
      )}
      <div className="diff-body">{body}</div>
    </div>
  );
}

// A textarea's text from `text`: each \r\n, and each \r on its own, a \n.
const asTextarea = (text: string) =>
  text.includes('\r') ? text.replace(/\r\n?/g, '\n') : text;

// The first row at or after a line of `after`: the row that is the line, or the first of the
// lines removed just before it.
function firstRowAt(lineAt: Int32Array, count: number, line: number) {
  let row = 0;
  while (row < count && lineAt[row]! < line) row++;
  return row;
}

// The panes of lines, which React only places: how far down they're scrolled, the same for each
// (side by side they scroll down together, and one that comes in, as the layout changes, starts
// there too), and how tall they are, which decides how many rows are drawn (onHeight). A ref for
// each pane, the same function every time.
function createPanes(onHeight: (height: number) => void) {
  const elements: (HTMLElement | null)[] = [null, null];
  let top = 0;
  const observer = new ResizeObserver(() => {
    const shown = elements.find(Boolean);
    if (shown) onHeight(shown.clientHeight);
  });
  const refs = elements.map((_, slot) => (element: HTMLElement | null) => {
    const old = elements[slot];
    if (old) observer.unobserve(old);
    elements[slot] = element;
    if (element) {
      observer.observe(element);
      element.scrollTop = top;
    }
  });
  return {
    ref: (slot: number) => refs[slot]!,
    scrollTo(scrollTop: number) {
      top = scrollTop;
      for (const element of elements) if (element) element.scrollTop = scrollTop;
    },
    // The others to where `pane` was scrolled.
    follow(pane: HTMLElement) {
      top = pane.scrollTop;
      for (const element of elements)
        if (element && element !== pane && Math.abs(element.scrollTop - top) > 0.5)
          element.scrollTop = top;
    },
    disconnect: () => observer.disconnect(),
  };
}

// A line's text in the body editor's colours, the parts that changed marked.
function Code({
  text,
  marks,
  added,
}: {
  text: string;
  marks: Span[] | null;
  added: boolean;
}) {
  const ranges = marks ?? [];
  const parts: ReactNode[] = [];
  let at = 0;
  let next = 0;
  for (const [kind, piece] of tokens(text)) {
    const end = at + piece.length;
    // The token cut where a mark starts or ends inside it.
    for (let from = at; from < end;) {
      while (next < ranges.length && ranges[next]![1] <= from) next++;
      const range = ranges[next];
      const inside = Boolean(range && range[0] <= from);
      const to = range ? Math.min(end, inside ? range[1] : range[0]) : end;
      const cut = to > from ? to : end;
      const className = cn(
        kind && `tk-${kind}`,
        inside && (added ? 'diff-word-add' : 'diff-word-del'),
      );
      const part = text.slice(from, cut);
      parts.push(
        className ? (
          <span key={from} className={className}>
            {part}
          </span>
        ) : (
          part
        ),
      );
      from = cut;
    }
    at = end;
  }
  return (
    <span data-code className="diff-code">
      {parts}
    </span>
  );
}

// For a changed line, the parts of it that changed: worked out against the line it was changed
// into (or from), the first removed line of a change paired with its first added line, and so on,
// once a row with it is drawn, then kept.
function wordMarks(diff: TextDiff) {
  const intoAfter = new Map<number, number>();
  const fromBefore = new Map<number, number>();
  let removed: number[] = [];
  let added: number[] = [];
  const pair = () => {
    for (let index = 0; index < Math.min(removed.length, added.length); index++) {
      intoAfter.set(removed[index]!, added[index]!);
      fromBefore.set(added[index]!, removed[index]!);
    }
    removed = [];
    added = [];
  };
  for (const line of diff.lines) {
    if (line.kind === 'del') removed.push(line.before);
    else if (line.kind === 'add') added.push(line.after);
    else pair();
  }
  pair();
  const found = new Map<string, ReturnType<typeof diffWords>>();
  return (kind: DiffKind, line: number): Span[] | null => {
    if (kind === 'same') return null;
    const beforeLine = kind === 'del' ? line : fromBefore.get(line);
    const afterLine = kind === 'add' ? line : intoAfter.get(line);
    if (beforeLine === undefined || afterLine === undefined) return null;
    const key = `${beforeLine} ${afterLine}`;
    if (!found.has(key))
      found.set(key, diffWords(diff.before[beforeLine]!, diff.after[afterLine]!));
    const words = found.get(key);
    return words ? words[kind === 'del' ? 'before' : 'after'] : null;
  };
}

// Side by side: a row for each line kept, and for each change as many as its longer side, its
// removed lines down the left and its added ones down the right, gaps under the shorter.
function pairUp(diff: TextDiff): Pair[] {
  const out: Pair[] = [];
  let removed: number[] = [];
  let added: number[] = [];
  const flush = () => {
    for (let index = 0; index < Math.max(removed.length, added.length); index++)
      out.push({
        left: index < removed.length ? { kind: 'del', line: removed[index]! } : GAP,
        right: index < added.length ? { kind: 'add', line: added[index]! } : GAP,
      });
    removed = [];
    added = [];
  };
  for (const line of diff.lines) {
    if (line.kind === 'del') removed.push(line.before);
    else if (line.kind === 'add') added.push(line.after);
    else {
      flush();
      out.push({
        left: { kind: 'same', line: line.before },
        right: { kind: 'same', line: line.after },
      });
    }
  }
  flush();
  return out;
}

// The character in a line's text under the pointer, from the caret the browser would put there;
// past the end of the text, its end.
function columnAt(code: Element, x: number, y: number) {
  const caret = caretAt(x, y);
  if (caret && code.contains(caret.node)) {
    const range = document.createRange();
    range.setStart(code, 0);
    range.setEnd(caret.node, caret.offset);
    return range.toString().length;
  }
  return x > code.getBoundingClientRect().right ? Number.POSITIVE_INFINITY : 0;
}

// caretPositionFromPoint is the standard's, in Firefox and in Chrome from 128; Chrome before had
// caretRangeFromPoint only.
function caretAt(x: number, y: number) {
  const page = document as unknown as {
    caretPositionFromPoint?: (x: number, y: number) => CaretPosition | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (page.caretPositionFromPoint) {
    const position = page.caretPositionFromPoint(x, y);
    return position && { node: position.offsetNode, offset: position.offset };
  }
  const range = page.caretRangeFromPoint?.(x, y);
  return range && { node: range.startContainer, offset: range.startOffset };
}
