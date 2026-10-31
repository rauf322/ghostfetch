// Lightweight code editor: a transparent <textarea> laid over a syntax-highlighted <pre>
// (highlight.ts), plus a line-number gutter. Enough for JSON bodies and short transform scripts,
// and a JSON body of a megabyte: only what's on screen gets its colours. Cmd/Ctrl+F inside it
// opens its own find bar (find-bar.ts) instead of the browser's, which would search the whole
// page, and Cmd/Ctrl with =, - and 0 sizes its text instead of zooming the page. With the Vim
// switch on, vim.ts handles its keys. It marks a mistake it's given (setProblem), the way a
// language server's client would: a squiggle under it, the line tinted, a note at the end of the
// line and the whole message on hover. Its look is code-editor.css; the React screens use it
// through ../code-editor.tsx.
import { icon } from '../../../lib/index.ts';
import { createVim, rememberVim, vimPreferred } from '../vim/vim.ts';
import { createFindBar } from './find-bar.ts';
import { chunks, tokens } from './highlight.ts';
import type { Language } from './highlight.ts';

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

interface CodeEditorOptions {
  value?: string;
  language?: Language;
  placeholder?: string;
  onChange?: (value: string) => void;
  // As tall as its text instead of a fixed 280 px: between 120 px and --code-max (code-editor.css),
  // which the page sets to the room it has.
  fit?: boolean;
}

export function createCodeEditor({
  value = '',
  language = 'json',
  placeholder = '',
  onChange,
  fit = false,
}: CodeEditorOptions = {}) {
  const root = document.createElement('div');
  root.className = 'code';
  if (fit) root.dataset.fit = '';
  // The find marks and a mistake's marks sit on their own layers under the highlighted text, so
  // they never interfere with the syntax colours or with typing. Vim's block cursor sits above
  // them, and its status line along the bottom.
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
      <pre class="code-marks" aria-hidden="true"></pre>
      <pre class="code-errors" aria-hidden="true"></pre>
      <pre class="code-highlight" aria-hidden="true"></pre>
      <pre class="code-cursor" aria-hidden="true"></pre>
      <textarea spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off"></textarea>
      <div class="code-error-tip" role="tooltip" hidden><strong></strong><span></span></div>
      <div class="code-size" aria-live="polite" hidden></div>
    </div>
    <div class="code-vim" hidden><span class="code-vim-mode" aria-live="polite"></span><span class="code-vim-keys"></span><span class="code-vim-pos"></span></div>`;
  const textarea = root.querySelector('textarea')!;
  const layer = root.querySelector<HTMLElement>('.code-highlight')!;
  const marks = root.querySelector<HTMLElement>('.code-marks')!;
  const errors = root.querySelector<HTMLElement>('.code-errors')!;
  const band = root.querySelector<HTMLElement>('.code-error-band')!;
  const bar = root.querySelector<HTMLElement>('.code-error-bar')!;
  const tip = root.querySelector<HTMLElement>('.code-error-tip')!;
  const cursorLayer = root.querySelector<HTMLElement>('.code-cursor')!;
  const lines = root.querySelector<HTMLElement>('.code-lines')!;
  const findBar = root.querySelector<HTMLElement>('.code-find')!;
  const statusLine = root.querySelector<HTMLElement>('.code-vim')!;
  const sizeBadge = root.querySelector<HTMLElement>('.code-size')!;
  textarea.value = value;
  textarea.placeholder = placeholder;
  let lineCount = 0;
  let gutter = '';
  let escaped = false;
  // The mistake being marked, and the line it's on (from 0), or -1.
  let problem: CodeProblem | null = null;
  let problemLine = -1;
  let fontSize = fontSizePreferred();
  let sizeShown: ReturnType<typeof setTimeout> | undefined;
  applyFontSize();
  // A long JSON body's pieces on the highlight layer (chunks()): their text, the line each starts
  // on, the element each is in, and whether that one has its colours.
  let pieces: string[] = [];
  let pieceLines: number[] = [];
  let pieceElements: HTMLElement[] = [];
  let painted: boolean[] = [];

  function render() {
    lineCount = textarea.value.split('\n').length;
    renderLayer();
    renderGutter();
    find.refresh();
    fitHeight();
    sync();
  }

  // The highlight layer: a short body coloured whole, a long one as its pieces, uncoloured until
  // paintPieces() finds them on screen. The trailing newlines let the layer scroll as far as the
  // textarea does.
  function renderLayer() {
    const text = textarea.value;
    pieces = chunks(text, language);
    if (pieces.length === 1) {
      pieceElements = [];
      colour(layer, text);
      layer.append('\n\n');
      return;
    }
    let line = 0;
    pieceLines = [];
    pieceElements = pieces.map((piece) => {
      pieceLines.push(line);
      for (let at = piece.indexOf('\n'); at !== -1; at = piece.indexOf('\n', at + 1))
        line++;
      const element = document.createElement('span');
      element.textContent = piece;
      return element;
    });
    painted = pieces.map(() => false);
    layer.replaceChildren(...pieceElements, '\n\n');
  }

  // Colours the pieces on screen and a screen's worth around them, and takes the colours off the
  // rest, so the layer holds a few thousand coloured tokens at most, however long the body. The
  // lines tell which pieces are near; the pieces of a long line are told apart by where they are.
  function paintPieces() {
    if (!pieceElements.length) return;
    const { lineHeight, top } = metrics();
    const screen = Math.ceil(textarea.clientHeight / lineHeight);
    const first = Math.floor((textarea.scrollTop - top) / lineHeight) - screen;
    const last = first + 3 * screen;
    const view = layer.getBoundingClientRect();
    for (const [index, element] of pieceElements.entries()) {
      let near =
        pieceLines[index]! <= last && (pieceLines[index + 1] ?? lineCount) >= first;
      if (near) {
        const box = element.getBoundingClientRect();
        near = box.right >= view.left - view.width && box.left <= view.right + view.width;
      }
      if (near === painted[index]) continue;
      painted[index] = near;
      if (near) colour(element, pieces[index]!);
      else element.textContent = pieces[index]!;
    }
  }

  // Puts text in an element as its tokens, a span for each coloured one (the tk-* classes in
  // code-editor.css). Built from text nodes, so nothing in the body is ever read as HTML.
  function colour(element: HTMLElement, text: string) {
    const fragment = document.createDocumentFragment();
    for (const [kind, part] of tokens(text, language))
      fragment.append(kind ? span(`tk-${kind}`, part) : part);
    element.replaceChildren(fragment);
  }

  // The line numbers, the marked line's in white.
  function renderGutter() {
    const key = `${lineCount}:${problemLine}`;
    if (key === gutter) return;
    gutter = key;
    const numbers = Array.from({ length: lineCount }, (_, index) => index + 1);
    if (problemLine < 0 || problemLine >= lineCount) {
      lines.textContent = numbers.join('\n');
      return;
    }
    lines.replaceChildren(
      numbers
        .slice(0, problemLine)
        .map((number) => `${number}\n`)
        .join(''),
      span('error', String(problemLine + 1)),
      numbers
        .slice(problemLine + 1)
        .map((number) => `\n${number}`)
        .join(''),
    );
  }

  const span = (className: string, text: string) => {
    const element = document.createElement('span');
    element.className = className;
    element.textContent = text;
    return element;
  };

  // The marks for the mistake: the text up to it invisible, a squiggle under it, its note after
  // the end of its line.
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
    problemLine = text.slice(0, from).split('\n').length - 1;
    // Built from text nodes, so nothing in the body is ever read as HTML. The trailing newlines
    // let the layer scroll as far as the textarea does.
    errors.replaceChildren(
      text.slice(0, from),
      span('code-error', text.slice(from, to)),
      text.slice(to, end),
      ...(note ? [span('code-error-note', `   ${note}`)] : []),
      `${text.slice(end)}\n\n`,
    );
    band.hidden = false;
    bar.hidden = false;
    renderGutter();
    sync();
  }

  function metrics() {
    const style = getComputedStyle(textarea);
    return {
      lineHeight: parseFloat(style.lineHeight),
      top: parseFloat(style.paddingTop),
      left: parseFloat(style.paddingLeft),
      style,
    };
  }

  // Every character is as wide as the next in the editor's monospace font.
  const ruler = document.createElement('canvas').getContext('2d');
  function charWidth(style: CSSStyleDeclaration) {
    if (!ruler) return parseFloat(style.fontSize) * 0.6;
    ruler.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return ruler.measureText('0'.repeat(20)).width / 20;
  }

  function sync() {
    for (const pre of [layer, marks, errors, cursorLayer]) {
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
    if (!fit) return;
    const { lineHeight, style } = metrics();
    const height =
      lineCount * lineHeight +
      parseFloat(style.paddingTop) +
      parseFloat(style.paddingBottom) +
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
    fitHeight();
    paintPieces();
  }).observe(textarea);

  function applyFontSize() {
    root.style.fontSize = fontSize === DEFAULT_FONT_SIZE ? '' : `${fontSize}px`;
  }

  // The text size, in px: one of FONT_SIZES, remembered for every body editor (and forgotten again
  // at the default). The new size shows in the corner for a moment.
  function setFontSize(size: number) {
    fontSize = size;
    if (size === DEFAULT_FONT_SIZE) localStorage.removeItem(FONT_SIZE_KEY);
    else localStorage.setItem(FONT_SIZE_KEY, String(size));
    applyFontSize();
    fitHeight();
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
    const { lineHeight, top, left, style } = metrics();
    const width = charWidth(style);
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
  let commanding = false;
  root.addEventListener(
    'input',
    (event) => {
      if (commanding) event.stopImmediatePropagation();
    },
    { capture: true },
  );
  function command(name: string, text?: string) {
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
  textarea.addEventListener('scroll', () => {
    tip.hidden = true;
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

  render();
  return {
    root,
    textarea,
    get value() {
      return textarea.value;
    },
    // Replaces the content as one undoable edit and notifies onChange.
    replace(text: string) {
      textarea.focus();
      textarea.select();
      insert(text);
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
