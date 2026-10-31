// Lightweight code editor: a transparent <textarea> laid over a syntax-highlighted <pre>
// (highlight.ts), plus a line-number gutter. Enough for JSON bodies and short transform scripts.
// Cmd/Ctrl+F inside it opens its own find bar (find-bar.ts) instead of the browser's, which would
// search the whole page. With the Vim switch on, vim.ts handles its keys. It marks a mistake it's
// given (setProblem), the way a language server's client would: a squiggle under it, the line
// tinted, a note at the end of the line and the whole message on hover. Its look is
// code-editor.css; the React screens use it through ../code-editor.tsx.
import { icon } from '../../../lib/index.ts';
import { createVim, rememberVim, vimPreferred } from '../vim/vim.ts';
import { createFindBar } from './find-bar.ts';
import { highlight } from './highlight.ts';
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

// The text sizes − and + step through, in px, and the one the stylesheet starts at. One setting
// for every body editor, remembered in this browser like the Vim switch.
export const FONT_SIZES = [10, 11, 11.5, 12, 13, 14, 16, 18];
export const DEFAULT_FONT_SIZE = 11.5;
const FONT_SIZE_KEY = 'ghostfetch.fontSize';
export function fontSizePreferred() {
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
  textarea.value = value;
  textarea.placeholder = placeholder;
  let lineCount = 0;
  let gutter = '';
  let escaped = false;
  // The mistake being marked, and the line it's on (from 0), or -1.
  let problem: CodeProblem | null = null;
  let problemLine = -1;
  let fontSize = fontSizePreferred();
  applyFontSize();

  function render() {
    // The trailing newline lets the layer scroll as far as the textarea does.
    layer.innerHTML = `${highlight(textarea.value, language)}\n\n`;
    lineCount = textarea.value.split('\n').length;
    renderGutter();
    find.refresh();
    fitHeight();
    sync();
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
    // The bars come and go, and a narrower editor can grow a horizontal scrollbar.
    const bars = new MutationObserver(fitHeight);
    for (const element of [findBar, statusLine])
      bars.observe(element, { attributes: true, attributeFilter: ['hidden'] });
    new ResizeObserver(fitHeight).observe(textarea);
  }

  function applyFontSize() {
    root.style.fontSize = fontSize === DEFAULT_FONT_SIZE ? '' : `${fontSize}px`;
  }

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
    active: vimPreferred(),
  });

  // execCommand keeps the browser's undo history intact, unlike setting .value.
  const insert = (text: string) => document.execCommand('insertText', false, text);

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
    document.execCommand('delete');
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
    get fontSize() {
      return fontSize;
    },
    // The text size, in px: one of FONT_SIZES, remembered for every body editor (and forgotten
    // again at the default).
    setFontSize(size: number) {
      fontSize = size;
      if (size === DEFAULT_FONT_SIZE) localStorage.removeItem(FONT_SIZE_KEY);
      else localStorage.setItem(FONT_SIZE_KEY, String(size));
      applyFontSize();
      fitHeight();
      sync();
    },
  };
}
