// Lightweight code editor: a transparent <textarea> laid over a syntax-highlighted <pre>
// (highlight.ts), plus a line-number gutter. Enough for JSON bodies, a body of a megabyte too:
// only what's on screen gets its colours. Cmd/Ctrl+F inside it
// opens its own find bar (find-bar.ts) instead of the browser's, which would search the whole
// page, and Cmd/Ctrl with =, - and 0 sizes its text instead of zooming the page. With the Vim
// switch on, vim.ts handles its keys. It marks a mistake it's given (setProblem), the way a
// language server's client would: a squiggle under it, the line tinted, a note at the end of the
// line and the whole message on hover. Its look is code-editor.css; the React screens use it
// through ../code-editor.tsx.
import { icon } from '../../../lib/index.ts';
import { createVim, rememberVim, vimPreferred } from '../vim/vim.ts';
import { createFindBar } from './find-bar.ts';
import { CHUNK, rechunk, tokens } from './highlight.ts';
import { keepOffset } from './keep-offset.ts';

export type CodeEditor = ReturnType<typeof createCodeEditor>;

// A mistake to mark: the characters from `from` up to `to` (on one line; a longer range is cut at
// the line's end), the whole message for hovering, and a few words for the end of the line.
export interface CodeProblem {
  from: number;
  to: number;
  line: number;
  column: number;
  message: string;
  note: string;
}

// Where you are in the text (the editor's `place`): each end of the selection as a line and a
// column, from 0, the cursor being `head`, and how far the text is scrolled down and along.
export interface CodePlace {
  anchor: { line: number; column: number };
  head: { line: number; column: number };
  top: number;
  left: number;
}

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

// The input an editing command makes, as the browser names it.
const INPUT_TYPES: Record<string, string> = {
  insertText: 'insertText',
  delete: 'deleteContentBackward',
  undo: 'historyUndo',
  redo: 'historyRedo',
};

// The most lines an insert goes through the browser's undoable editing command with. Chrome takes
// about 50 ms for 300 lines, and four times as long for each doubling.
const MAX_COMMAND_LINES = 300;
function longerThan(text: string, lines: number) {
  let count = 0;
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1))
    if (++count >= lines) return true;
  return false;
}

// The text sizes Cmd/Ctrl+= and Cmd/Ctrl+- step through, in px, and the one the stylesheet starts
// at, which Cmd/Ctrl+0 goes back to: the keys code editors size their text with (+ and _ are the
// same keys with Shift). One setting for every body editor, remembered in this browser like the
// Vim switch.
const FONT_SIZES = [10, 11, 11.5, 12, 13, 14, 16, 18, 20, 24];
const DEFAULT_FONT_SIZE = 11.5;
const FONT_SIZE_KEY = 'ghostfetch.fontSize';
const SIZE_KEYS: Record<string, 1 | -1 | 0> = { '=': 1, '+': 1, '-': -1, _: -1, '0': 0 };
function fontSizePreferred() {
  const size = Number(localStorage.getItem(FONT_SIZE_KEY));
  return FONT_SIZES.includes(size) ? size : DEFAULT_FONT_SIZE;
}

export function countLines(text: string) {
  let count = 1;
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) count++;
  return count;
}

// Where line `line` (from 0) starts in `text`; past the last line, where the last one does.
function startOfLine(text: string, line: number) {
  let start = 0;
  for (let count = 0; count < line; count++) {
    const next = text.indexOf('\n', start);
    if (next === -1) break;
    start = next + 1;
  }
  return start;
}

const span = (className: string, text: string) => {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  return element;
};

// Puts text in an element as its tokens, a span for each coloured one (the tk-* classes in
// code-editor.css). Built from text nodes, so nothing in the body is ever read as HTML. The body
// editor colours its pieces with it, and CodeView (../code-editor.tsx) a captured response's.
export function colour(element: HTMLElement, text: string) {
  const fragment = document.createDocumentFragment();
  for (const [kind, part] of tokens(text))
    fragment.append(kind ? span(`tk-${kind}`, part) : part);
  element.replaceChildren(fragment);
}

// The line numbers from `from` to `to`, one a line.
function numbers(from: number, to: number) {
  let text = '';
  for (let number = from; number <= to; number++)
    text += number === from ? number : `\n${number}`;
  return text;
}

// How long numbers(1, count) is.
function numbersLength(count: number) {
  let length = count - 1;
  for (let digits = 1, from = 1; from <= count; digits++, from *= 10)
    length += (Math.min(count, from * 10 - 1) - from + 1) * digits;
  return length;
}

// Whether a piece of a body (chunks()) is whole lines: it starts a line (`index` 0, or after a
// piece that ends one) and ends with a line break.
const wholeLines = (pieces: string[], index: number) =>
  (index === 0 || pieces[index - 1]!.endsWith('\n')) && pieces[index]!.endsWith('\n');

interface CodeEditorOptions {
  value?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  // As tall as its text instead of a fixed 280 px: between 120 px and --code-max (code-editor.css),
  // which the page sets to the room it has.
  fit?: boolean;
}

export function createCodeEditor({
  value = '',
  placeholder = '',
  onChange,
  fit = false,
}: CodeEditorOptions = {}) {
  const root = document.createElement('div');
  root.className = 'code';
  if (fit) root.dataset.fit = '';
  // The find marks and a mistake's marks sit on their own layers under the highlighted text, so
  // they never interfere with the syntax colours or with typing. Vim's block cursor sits above
  // them, and its status line along the bottom. Each layer is a <pre> that scrolls along with the
  // textarea, its text in a .code-text of a fixed width (code-editor.css): lines never wrap, so a
  // long body is laid out once, not again whenever the editor changes width. The textarea keeps
  // its width while the sidebar's edge is dragged or the sidebar slides (data-keep-width, see
  // shared/ui/sidebar.tsx) for the same reason.
  root.innerHTML = `
    <div class="code-find" role="search" hidden>
      <span class="code-find-icon" aria-hidden="true">${icon('search', 13)}<span class="code-find-prompt"></span></span>
      <input type="text" class="code-find-input" placeholder="Find in body" aria-label="Find in body" spellcheck="false" autocomplete="off">
      <span class="code-find-count" aria-live="polite"></span>
      <button type="button" data-find="prev" title="Previous match (Shift+Enter)">${icon('up', 14)}</button>
      <button type="button" data-find="next" title="Next match (Enter)">${icon('down', 14)}</button>
      <button type="button" data-find="close" title="Close (Esc)">${icon('close', 13)}</button>
    </div>
    <div class="code-gutter" aria-hidden="true"><div class="code-error-bar" hidden></div><div class="code-lines"></div></div>
    <div class="code-main">
      <div class="code-error-band" hidden></div>
      <pre class="code-marks" aria-hidden="true"><span class="code-text"></span></pre>
      <pre class="code-errors" aria-hidden="true"><span class="code-text"></span></pre>
      <pre class="code-highlight" aria-hidden="true"><span class="code-text"></span></pre>
      <pre class="code-cursor" aria-hidden="true"><span class="code-text"></span></pre>
      <textarea spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off" data-keep-width></textarea>
      <div class="code-error-tip" role="tooltip" hidden><strong></strong><span></span></div>
      <div class="code-size" aria-live="polite" hidden></div>
    </div>
    <div class="code-vim" hidden><span class="code-vim-mode" aria-live="polite"></span><span class="code-vim-keys"></span><span class="code-vim-pos"></span></div>`;
  const textarea = root.querySelector('textarea')!;
  // The layers that scroll with the textarea, and the text of each.
  const scrollers = [...root.querySelectorAll<HTMLElement>('.code-main pre')];
  const layer = root.querySelector<HTMLElement>('.code-highlight .code-text')!;
  const marks = root.querySelector<HTMLElement>('.code-marks .code-text')!;
  const errors = root.querySelector<HTMLElement>('.code-errors .code-text')!;
  const band = root.querySelector<HTMLElement>('.code-error-band')!;
  const bar = root.querySelector<HTMLElement>('.code-error-bar')!;
  const tip = root.querySelector<HTMLElement>('.code-error-tip')!;
  const cursorLayer = root.querySelector<HTMLElement>('.code-cursor .code-text')!;
  const lines = root.querySelector<HTMLElement>('.code-lines')!;
  const findBar = root.querySelector<HTMLElement>('.code-find')!;
  const statusLine = root.querySelector<HTMLElement>('.code-vim')!;
  const sizeBadge = root.querySelector<HTMLElement>('.code-size')!;
  textarea.value = value;
  textarea.placeholder = placeholder;
  let lineCount = 0;
  let escaped = false;
  // The mistake being marked, and the line it's on (from 0), or -1.
  let problem: CodeProblem | null = null;
  let problemLine = -1;
  let fontSize = fontSizePreferred();
  let sizeShown: ReturnType<typeof setTimeout> | undefined;
  // The text area's line height, padding and font (metrics()), read once.
  let measured: ReturnType<typeof measure> | null = null;
  applyFontSize();
  // A long JSON body's pieces on the highlight layer (chunks()): their text, how many line breaks
  // each has and the line each starts on, the element each is in, and whether that one has its
  // colours.
  let pieces: string[] = [];
  let pieceBreaks: number[] = [];
  let pieceLines: number[] = [];
  let pieceElements: HTMLElement[] = [];
  let painted: boolean[] = [];

  function render() {
    renderLayer();
    renderGutter();
    find.refresh();
    fitHeight();
    sync();
  }

  // The highlight layer: a short body coloured whole, a long one as its pieces, uncoloured until
  // paintPieces() finds them on screen. An edit gives only the pieces it touched a new element
  // (typing touches one, rechunk()): the rest keep theirs, with their colours, and the browser
  // keeps their layout. A piece of whole lines is a block of its own (code-editor.css), so the
  // browser lays out the one that changed and leaves the others; the pieces of a long line run on
  // from one another. The trailing newlines let the layer scroll as far as the textarea does.
  function renderLayer() {
    const text = textarea.value;
    if (text.length <= CHUNK) {
      lineCount = countLines(text);
      pieces = [];
      pieceBreaks = [];
      pieceLines = [];
      pieceElements = [];
      painted = [];
      colour(layer, text);
      layer.append('\n\n');
      return;
    }
    const { first, last, fresh } = rechunk(pieces, text);
    const elements = fresh.map((piece) => {
      const element = document.createElement('span');
      element.textContent = piece;
      return element;
    });
    if (!pieceElements.length) layer.replaceChildren(...elements, '\n\n');
    else {
      // Before the first piece that stays after them, or the trailing newlines.
      const before = pieceElements[last + 1] ?? layer.lastChild;
      for (const element of pieceElements.slice(first, last + 1)) element.remove();
      const fragment = document.createDocumentFragment();
      fragment.append(...elements);
      layer.insertBefore(fragment, before);
    }
    const count = last - first + 1;
    pieces.splice(first, count, ...fresh);
    pieceBreaks.splice(first, count, ...fresh.map((piece) => countLines(piece) - 1));
    pieceElements.splice(first, count, ...elements);
    painted.splice(first, count, ...fresh.map(() => false));
    pieceLines = [];
    let line = 0;
    pieces.forEach((piece, index) => {
      pieceLines.push(line);
      line += pieceBreaks[index]!;
      // Whether a piece is whole lines can change with the piece before it: the one after the
      // fresh pieces is told again.
      if (index >= first && index <= first + fresh.length)
        pieceElements[index]!.classList.toggle('code-piece', wholeLines(pieces, index));
    });
    lineCount = line + 1;
  }

  // Colours the pieces on screen and a screen's worth around them, and takes the colours off the
  // rest, so the layer holds a few thousand coloured tokens at most, however long the body. The
  // lines tell which pieces are near; the pieces of a long line are told apart by where they are.
  // It reads first and writes after: a write between reads would have each read lay the layer
  // out again.
  function paintPieces() {
    if (!pieceElements.length) return;
    const { lineHeight, top } = metrics();
    const screen = Math.ceil(textarea.clientHeight / lineHeight);
    const first = Math.floor((textarea.scrollTop - top) / lineHeight) - screen;
    const last = first + 3 * screen;
    // What the layer shows: its <pre>, as the text in it is far wider.
    let view: DOMRect | undefined;
    const near = pieceElements.map((element, index) => {
      if (pieceLines[index]! > last || (pieceLines[index + 1] ?? lineCount) < first)
        return false;
      if (element.classList.contains('code-piece')) return true;
      view ??= layer.parentElement!.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      return box.right >= view.left - view.width && box.left <= view.right + view.width;
    });
    near.forEach((isNear, index) => {
      if (isNear === painted[index]) return;
      painted[index] = isNear;
      if (isNear) colour(pieceElements[index]!, pieces[index]!);
      else pieceElements[index]!.textContent = pieces[index]!;
    });
  }

  // The line numbers, the marked line's in white. Lines typed or deleted add numbers at the end
  // or take them off, which the browser lays out without going over the rest.
  let gutterLines = 0;
  let gutterProblem = -1;
  function renderGutter() {
    const marked = problemLine >= 0 && problemLine < lineCount ? problemLine : -1;
    if (lineCount === gutterLines && marked === gutterProblem) return;
    const text = lines.firstChild;
    if (marked >= 0) {
      lines.replaceChildren(
        marked ? `${numbers(1, marked)}\n` : '',
        span('error', String(marked + 1)),
        marked + 1 < lineCount ? `\n${numbers(marked + 2, lineCount)}` : '',
      );
    } else if (gutterProblem >= 0 || !gutterLines || !(text instanceof Text)) {
      lines.textContent = numbers(1, lineCount);
    } else if (lineCount > gutterLines) {
      text.appendData(`\n${numbers(gutterLines + 1, lineCount)}`);
    } else {
      text.deleteData(numbersLength(lineCount), text.length);
    }
    gutterLines = lineCount;
    gutterProblem = marked;
  }

  // The marks for the mistake: the text of its line up to it invisible, a squiggle under it, its
  // note after the end of the line. Only that line is on the layer, set down as many line heights
  // as there are lines above it (lh, which follows the text size), so marking a mistake costs the
  // same in a long body as in a short one; the layer still scrolls as far as the textarea does
  // (fitLayers()).
  function renderProblem() {
    const text = textarea.value;
    tip.hidden = true;
    if (!problem || problem.to <= problem.from || problem.from >= text.length) {
      problemLine = -1;
      errors.textContent = '';
      band.hidden = true;
      bar.hidden = true;
      renderGutter();
      return;
    }
    const { from, note } = problem;
    let end = text.indexOf('\n', from);
    if (end === -1) end = text.length;
    const to = Math.min(problem.to, Math.max(end, from + 1));
    const start = from ? text.lastIndexOf('\n', from - 1) + 1 : 0;
    problemLine = countLines(text.slice(0, from)) - 1;
    // Built from text nodes, so nothing in the body is ever read as HTML.
    errors.replaceChildren(
      text.slice(start, from),
      span('code-error', text.slice(from, to)),
      text.slice(to, end),
      ...(note ? [span('code-error-note', `   ${note}`)] : []),
    );
    errors.style.paddingTop = `${problemLine}lh`;
    band.hidden = false;
    bar.hidden = false;
    renderGutter();
    sync();
  }

  // The layers that hold one line (the mistake's, vim's cursor's) are made as tall as the whole
  // text and the two lines the highlight layer adds, so they scroll as far as the textarea does.
  function fitLayers() {
    const height = `${lineCount + 2}lh`;
    errors.style.minHeight = height;
    cursorLayer.style.minHeight = height;
  }

  // The text area's line height, padding and font, read once: reading its line height from the
  // browser lays the page out if anything has changed, which in the middle of a redraw laid the
  // whole body out again. Read again after the text size changes, or the text area is resized.
  function measure() {
    const style = getComputedStyle(textarea);
    return {
      lineHeight: parseFloat(style.lineHeight),
      top: parseFloat(style.paddingTop),
      bottom: parseFloat(style.paddingBottom),
      left: parseFloat(style.paddingLeft),
      right: parseFloat(style.paddingRight),
      fontSize: parseFloat(style.fontSize),
      font: `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
    };
  }
  function metrics() {
    // Off the page (as the editor is made) there's nothing to read yet.
    if (!measured) {
      const now = measure();
      if (!textarea.isConnected) return now;
      measured = now;
    }
    return measured;
  }

  // Every character is as wide as the next in the editor's monospace font.
  const ruler = document.createElement('canvas').getContext('2d');
  function charWidth(of: ReturnType<typeof measure>) {
    if (!ruler) return of.fontSize * 0.6;
    ruler.font = of.font;
    return ruler.measureText('0'.repeat(20)).width / 20;
  }

  function sync() {
    for (const pre of scrollers) {
      pre.scrollTop = textarea.scrollTop;
      pre.scrollLeft = textarea.scrollLeft;
    }
    lines.style.transform = `translateY(${-textarea.scrollTop}px)`;
    if (problemLine >= 0) {
      const { lineHeight, top } = metrics();
      const y = `translateY(${top + problemLine * lineHeight - textarea.scrollTop}px)`;
      for (const mark of [band, bar]) {
        mark.style.height = `${lineHeight}px`;
        mark.style.transform = y;
      }
    }
    paintPieces();
  }

  // With `fit`, the height of the whole text: lines, padding, a horizontal scrollbar if there is
  // one, and the find bar and vim's status line while they show. The stylesheet clamps it.
  function fitHeight() {
    fitLayers();
    if (!fit) return;
    const { lineHeight, top, bottom } = metrics();
    const height =
      lineCount * lineHeight +
      top +
      bottom +
      (textarea.offsetHeight - textarea.clientHeight) +
      findBar.offsetHeight +
      statusLine.offsetHeight +
      2;
    root.style.setProperty('--code-fit', `${Math.ceil(height)}px`);
  }
  if (fit) {
    // The bars come and go.
    const bars = new MutationObserver(fitHeight);
    for (const element of [findBar, statusLine])
      bars.observe(element, { attributes: true, attributeFilter: ['hidden'] });
  }
  // The text area changes size when the editor goes on the page, shows again after being hidden,
  // or the window changes: a narrower one can grow a horizontal scrollbar, and different pieces of
  // a long body are on screen.
  new ResizeObserver(() => {
    measured = null;
    fitHeight();
    paintPieces();
  }).observe(textarea);

  function applyFontSize() {
    root.style.fontSize = fontSize === DEFAULT_FONT_SIZE ? '' : `${fontSize}px`;
    measured = null;
  }

  // The cursor (the end of the selection that moves, where vim keeps its cursor too): its line and
  // its column, from 0.
  function cursorAt() {
    const { selectionStart, selectionEnd, selectionDirection } = textarea;
    const before = textarea.value.slice(
      0,
      selectionDirection === 'backward' ? selectionStart : selectionEnd,
    );
    const start = before.lastIndexOf('\n') + 1;
    return { line: before.split('\n').length - 1, column: before.length - start };
  }

  // Sizes the text around what you're looking at, instead of around the top line (where the
  // browser would keep it, so the lines under it slid down and out of view): the middle of the
  // cursor's line stays where it is in the view, so the text grows evenly up and down from it, or
  // with the cursor out of view, the middle of the view does. Along the lines, the column at the
  // left edge stays there, unless the cursor would go out of view.
  // What it keeps in place (`held`): a point down the lines (in lines from the top of the text,
  // with a fraction) and how far down the view it is, the column at the left edge (null at the
  // start of the lines), and the cursor while it's to stay in view. Steps in a row keep the same
  // place while nothing else has moved, rather than drifting a pixel each as the browser rounds
  // where it scrolls to.
  let held: {
    at: string;
    line: number;
    y: number;
    edge: number | null;
    cursor: { line: number; column: number } | null;
  } | null = null;
  const where = () =>
    [
      textarea.scrollTop,
      textarea.scrollLeft,
      textarea.selectionStart,
      textarea.selectionEnd,
      textarea.value.length,
      document.activeElement === textarea,
    ].join();

  function resizeInPlace(size: number) {
    const was = metrics();
    const wasWidth = charWidth(was);
    if (held?.at !== where()) {
      const { scrollTop, scrollLeft, clientHeight, clientWidth } = textarea;
      const cursor = cursorAt();
      const cursorY = was.top + cursor.line * was.lineHeight - scrollTop;
      const cursorX = was.left + cursor.column * wasWidth - scrollLeft;
      const focused = document.activeElement === textarea;
      const lineShown =
        focused && cursorY >= 0 && cursorY + was.lineHeight <= clientHeight;
      const columnShown = cursorX >= 0 && cursorX + wasWidth <= clientWidth;
      const line = lineShown
        ? cursor.line + 0.5
        : (scrollTop + clientHeight / 2 - was.top) / was.lineHeight;
      held = {
        at: '',
        line,
        y: was.top + line * was.lineHeight - scrollTop,
        edge: scrollLeft ? (scrollLeft - was.left) / wasWidth : null,
        cursor: lineShown && columnShown ? cursor : null,
      };
    }

    fontSize = size;
    applyFontSize();
    fitHeight();

    const now = metrics();
    const width = charWidth(now);
    textarea.scrollTop = now.top + held.line * now.lineHeight - held.y;
    let left = held.edge === null ? 0 : now.left + held.edge * width;
    if (held.cursor) {
      const x = now.left + held.cursor.column * width;
      left = Math.min(Math.max(left, x + width - textarea.clientWidth), x - now.left);
    }
    textarea.scrollLeft = Math.max(0, left);
    held.at = where();
  }

  // The text size, in px: one of FONT_SIZES, remembered for every body editor (and forgotten again
  // at the default). The new size shows in the corner for a moment.
  function setFontSize(size: number) {
    if (size === DEFAULT_FONT_SIZE) localStorage.removeItem(FONT_SIZE_KEY);
    else localStorage.setItem(FONT_SIZE_KEY, String(size));
    resizeInPlace(size);
    sync();
    sizeBadge.textContent = `${size} px`;
    sizeBadge.hidden = false;
    clearTimeout(sizeShown);
    sizeShown = setTimeout(() => {
      sizeBadge.hidden = true;
    }, 1200);
  }

  // Cmd/Ctrl with = or + (larger), - or _ (smaller) or 0 (the default), anywhere in the editor,
  // the find bar too. It goes first, before vim and the find bar see the key, and the browser
  // doesn't zoom the page.
  root.addEventListener(
    'keydown',
    (event) => {
      const step = SIZE_KEYS[event.key];
      if (step === undefined || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      const at = FONT_SIZES.indexOf(fontSize) + step;
      setFontSize(
        step === 0
          ? DEFAULT_FONT_SIZE
          : FONT_SIZES[Math.min(Math.max(at, 0), FONT_SIZES.length - 1)]!,
      );
    },
    { capture: true },
  );

  // The mistake's whole message while the pointer is over its marks (or its note), under the
  // line, or above it when there's no room below.
  function hover(event: MouseEvent) {
    if (problemLine < 0 || !problem) return;
    const { lineHeight, top, left } = metrics();
    const width = charWidth(metrics());
    const box = textarea.getBoundingClientRect();
    const line = Math.floor(
      (event.clientY - box.top - top + textarea.scrollTop) / lineHeight,
    );
    const column = Math.floor(
      (event.clientX - box.left - left + textarea.scrollLeft) / width,
    );
    const text = textarea.value;
    const lineStart = text.lastIndexOf('\n', problem.from - 1) + 1;
    const lineEnd = text.indexOf('\n', problem.from);
    const lineLength = (lineEnd === -1 ? text.length : lineEnd) - lineStart;
    const fromColumn = problem.from - lineStart;
    const toColumn = Math.max(
      fromColumn + 1,
      Math.min(problem.to - lineStart, lineLength),
    );
    const over =
      line === problemLine &&
      ((column >= fromColumn && column < toColumn) ||
        (column >= lineLength && column < lineLength + 3 + problem.note.length));
    if (!over) {
      tip.hidden = true;
      return;
    }
    tip.querySelector('strong')!.textContent = `✗ ${problem.message}`;
    tip.querySelector('span')!.textContent =
      `Line ${problem.line}, column ${problem.column}`;
    tip.hidden = false;
    const main = tip.parentElement!;
    const x = left + fromColumn * width - textarea.scrollLeft - 6;
    tip.style.left = `${Math.max(4, Math.min(x, main.clientWidth - tip.offsetWidth - 4))}px`;
    const below = top + (problemLine + 1) * lineHeight - textarea.scrollTop + 2;
    tip.style.top = `${
      below + tip.offsetHeight > main.clientHeight
        ? below - lineHeight - tip.offsetHeight - 4
        : below
    }px`;
  }

  // An edit through the browser's editing commands, which keeps its undo history intact, unlike
  // setting .value. Vim edits through it too. Chrome makes a command that inserts many lines a
  // step per line, laying the text out and firing an input every time: 4,000 lines took seven
  // seconds, and Format on a long body froze the editor. So while a command runs its inputs stop
  // at the editor's edge, and once it's done it fires one of its own; and text of more lines than
  // MAX_COMMAND_LINES goes in directly, in a moment, though the browser can't undo that.
  // `then` runs once the text has changed, before the input that says so: a cursor it puts
  // somewhere is where vim, which takes an outside edit's cursor (vim.ts), finds it.
  let commanding = false;
  root.addEventListener(
    'input',
    (event) => {
      if (commanding) event.stopImmediatePropagation();
    },
    { capture: true },
  );
  function command(name: string, text?: string, then?: () => void) {
    const before = textarea.value;
    let done = true;
    if (name === 'insertText' && text && longerThan(text, MAX_COMMAND_LINES)) {
      textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, 'end');
    } else {
      commanding = true;
      try {
        done = document.execCommand(name, false, text);
      } finally {
        commanding = false;
      }
    }
    then?.();
    if (textarea.value !== before)
      textarea.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: INPUT_TYPES[name] ?? 'insertText',
          data: text ?? null,
        }),
      );
    return done;
  }

  // The find bar is vim's search line, and vim moves to what it finds, so each needs the other:
  // the find bar gets vim through a function it only calls once both exist.
  const find = createFindBar({ root, textarea, marks, sync, vim: () => vim });
  const vim = createVim({
    root,
    textarea,
    cursorLayer,
    statusLine,
    find: find.findFrom,
    openSearch: find.open,
    sync,
    metrics,
    execute: command,
    active: vimPreferred(),
  });

  const insert = (text: string) => command('insertText', text);

  textarea.addEventListener('input', () => {
    // The marks were for the text before this edit; whoever set them sets them again.
    problem = null;
    renderProblem();
    render();
    onChange?.(textarea.value);
  });
  // The scroll as it last was on screen, for `place`: hidden (in another view) or off the page, a
  // text area reads as scrolled to the top.
  let scrolled = { top: 0, left: 0 };
  textarea.addEventListener('scroll', () => {
    tip.hidden = true;
    scrolled = { top: textarea.scrollTop, left: textarea.scrollLeft };
    sync();
  });
  textarea.addEventListener('mousemove', hover);
  textarea.addEventListener('mouseleave', () => {
    tip.hidden = true;
  });
  textarea.addEventListener('keydown', (event) => {
    if (MODIFIERS.has(event.key)) return;
    // Esc and then Tab (or Shift+Tab) leaves the editor instead of indenting.
    const afterEscape = escaped;
    escaped = event.key === 'Escape';
    if (find.shortcut(event)) return;
    if (event.key === 'Escape' && find.isOpen) find.close({ select: false });
    if (vim.keydown(event) || event.key === 'Escape') return;
    if (event.key === 'Tab' && !afterEscape && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      if (event.shiftKey) outdent();
      else insert('  ');
      return;
    }
    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
      const before = textarea.value.slice(0, textarea.selectionStart);
      const indent = /[^\n]*$/.exec(before)![0].match(/^\s*/)![0];
      const opens = /[{[(]\s*$/.test(before);
      event.preventDefault();
      insert(`\n${indent}${opens ? '  ' : ''}`);
    }
  });

  function outdent() {
    const { selectionStart } = textarea;
    const lineStart = textarea.value.lastIndexOf('\n', selectionStart - 1) + 1;
    const spaces = /^ {1,2}/.exec(textarea.value.slice(lineStart))?.[0].length ?? 0;
    if (!spaces) return;
    textarea.setSelectionRange(lineStart, lineStart + spaces);
    command('delete');
    textarea.setSelectionRange(
      Math.max(lineStart, selectionStart - spaces),
      Math.max(lineStart, selectionStart - spaces),
    );
  }

  // What Format keeps where it is in the view: the cursor while its line is in view, or else the
  // start of the line in the middle of the view. As an offset in the text, how far down the view
  // its line is, and whether it's the cursor.
  function viewAnchor() {
    const { lineHeight, top } = metrics();
    const { scrollTop, clientHeight, selectionStart, selectionEnd, selectionDirection } =
      textarea;
    const y = top + cursorAt().line * lineHeight - scrollTop;
    if (y >= 0 && y + lineHeight <= clientHeight) {
      const offset = selectionDirection === 'backward' ? selectionStart : selectionEnd;
      return { offset, y, cursor: true };
    }
    const line = Math.min(
      lineCount - 1,
      Math.max(0, Math.floor((scrollTop + clientHeight / 2 - top) / lineHeight)),
    );
    const offset = startOfLine(textarea.value, line);
    return { offset, y: top + line * lineHeight - scrollTop, cursor: false };
  }

  render();
  return {
    root,
    textarea,
    get value() {
      return textarea.value;
    },
    // Replaces the content as one undoable edit and notifies onChange: Format. The selection moves
    // with the text around it (keepOffset), so the cursor stays on the character it was on, and
    // that line where it was in the view (with the cursor out of view, the line in the middle of
    // the view stays there). Along the lines the scroll stays, unless it would hide the cursor.
    replace(text: string) {
      const before = textarea.value;
      const { selectionStart, selectionEnd, selectionDirection, scrollLeft } = textarea;
      const anchor = viewAnchor();
      // The cursor you type at stays after what it follows, vim's block (in Normal mode) on what
      // it's on, and a selection keeps what it holds, no blanks more.
      const caret = selectionStart === selectionEnd;
      const typing = !vim.active || vim.mode === 'insert';
      let start = 0;
      let end = 0;
      textarea.focus();
      textarea.select();
      command('insertText', text, () => {
        const after = textarea.value;
        start = keepOffset(
          before,
          after,
          selectionStart,
          caret && typing ? 'end' : 'start',
        );
        end = keepOffset(before, after, selectionEnd, caret && !typing ? 'start' : 'end');
        textarea.setSelectionRange(start, end, selectionDirection);
      });
      const after = textarea.value;
      const cursor = selectionDirection === 'backward' ? start : end;
      const kept = anchor.cursor ? cursor : keepOffset(before, after, anchor.offset);
      const now = metrics();
      const line = countLines(after.slice(0, kept)) - 1;
      textarea.scrollTop = now.top + line * now.lineHeight - anchor.y;
      let left = scrollLeft;
      if (anchor.cursor) {
        const width = charWidth(now);
        const x = now.left + cursorAt().column * width;
        left = Math.min(Math.max(left, x + width - textarea.clientWidth), x - now.left);
      }
      textarea.scrollLeft = Math.max(0, left);
      sync();
    },
    // Where you are in the text: the selection and the scroll. setPlace() goes back there, in this
    // editor or in one made later (CodeEditor keeps a rule's, for when you come back to it).
    get place(): CodePlace {
      const { selectionStart, selectionEnd, selectionDirection } = textarea;
      const text = textarea.value;
      const backward = selectionDirection === 'backward';
      const at = (offset: number) => {
        const start = offset ? text.lastIndexOf('\n', offset - 1) + 1 : 0;
        return { line: countLines(text.slice(0, start)) - 1, column: offset - start };
      };
      const shown = textarea.getClientRects().length > 0;
      return {
        anchor: at(backward ? selectionEnd : selectionStart),
        head: at(backward ? selectionStart : selectionEnd),
        top: shown ? textarea.scrollTop : scrolled.top,
        left: shown ? textarea.scrollLeft : scrolled.left,
      };
    },
    // Goes back to a place: the selection (with vim keys, its cursor, in Normal mode) and the
    // scroll. A line or a column that isn't there any more is cut to the text's last line, or to
    // the line's end.
    setPlace({ anchor, head, top, left }: CodePlace) {
      const text = textarea.value;
      const offset = ({ line, column }: CodePlace['head']) => {
        const start = startOfLine(text, line);
        const end = text.indexOf('\n', start);
        return Math.min(start + column, end === -1 ? text.length : end);
      };
      // Its height on the page first: the scroll can go no further than that allows.
      measured = null;
      fitHeight();
      const to = offset(head);
      const from = vim.active ? to : offset(anchor);
      textarea.setSelectionRange(
        Math.min(from, to),
        Math.max(from, to),
        to < from ? 'backward' : 'forward',
      );
      if (vim.active) vim.setActive(true);
      textarea.scrollTop = top;
      textarea.scrollLeft = left;
      scrolled = { top: textarea.scrollTop, left: textarea.scrollLeft };
      sync();
    },
    get vim() {
      return vim.active;
    },
    // The Vim switch: one setting for every body editor, remembered in this browser.
    setVim(on: boolean) {
      rememberVim(on);
      vim.setActive(on);
      fitHeight();
    },
    // The mistake to mark in the current text, or null. Any edit clears it.
    setProblem(next: CodeProblem | null) {
      if (next === problem) return;
      problem = next;
      renderProblem();
    },
    // Puts the cursor at `offset`, scrolled into view, with the editor focused (vim takes the
    // cursor from there as it does after a click).
    reveal(offset: number) {
      // Vim adopts the cursor when the textarea gains focus, so it has to lose it first.
      if (document.activeElement === textarea) textarea.blur();
      textarea.setSelectionRange(offset, offset);
      textarea.focus({ preventScroll: true });
      const { lineHeight, top } = metrics();
      const y =
        top + (textarea.value.slice(0, offset).split('\n').length - 1) * lineHeight;
      if (
        y < textarea.scrollTop ||
        y + lineHeight > textarea.scrollTop + textarea.clientHeight
      )
        textarea.scrollTop = y - (textarea.clientHeight - lineHeight) / 2;
      sync();
    },
  };
}
