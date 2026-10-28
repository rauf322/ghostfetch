// Lightweight code editor: a transparent <textarea> laid over a syntax-highlighted <pre>
// (highlight.ts), plus a line-number gutter. Enough for JSON bodies and short transform scripts.
// Cmd/Ctrl+F inside it opens its own find bar (find-bar.ts) instead of the browser's, which would
// search the whole page. With the Vim switch on, vim.ts handles its keys. Its look is
// code-editor.css; the React screens use it through ../code-editor.tsx.
import { icon } from '../../../lib/index.ts';
import { createVim, rememberVim, vimPreferred } from '../vim/vim.ts';
import { createFindBar } from './find-bar.ts';
import { highlight } from './highlight.ts';
import type { Language } from './highlight.ts';

export type CodeEditor = ReturnType<typeof createCodeEditor>;

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

interface CodeEditorOptions {
  value?: string;
  language?: Language;
  placeholder?: string;
  onChange?: (value: string) => void;
}

export function createCodeEditor({
  value = '',
  language = 'json',
  placeholder = '',
  onChange,
}: CodeEditorOptions = {}) {
  const root = document.createElement('div');
  root.className = 'code';
  // The find marks sit on their own layer under the highlighted text, so they never interfere
  // with the syntax colours or with typing. Vim's block cursor sits above it, and its status
  // line along the bottom.
  root.innerHTML = `
    <div class="code-find" role="search" hidden>
      <span class="code-find-icon" aria-hidden="true">${icon('search', 13)}<span class="code-find-prompt"></span></span>
      <input type="text" class="code-find-input" placeholder="Find in body" aria-label="Find in body" spellcheck="false" autocomplete="off">
      <span class="code-find-count" aria-live="polite"></span>
      <button type="button" data-find="prev" title="Previous match (Shift+Enter)">${icon('up', 14)}</button>
      <button type="button" data-find="next" title="Next match (Enter)">${icon('down', 14)}</button>
      <button type="button" data-find="close" title="Close (Esc)">${icon('close', 13)}</button>
    </div>
    <div class="code-gutter" aria-hidden="true"><div class="code-lines"></div></div>
    <div class="code-main">
      <pre class="code-marks" aria-hidden="true"></pre>
      <pre class="code-highlight" aria-hidden="true"></pre>
      <pre class="code-cursor" aria-hidden="true"></pre>
      <textarea spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off"></textarea>
    </div>
    <div class="code-vim" hidden><span class="code-vim-mode" aria-live="polite"></span><span class="code-vim-keys"></span><span class="code-vim-pos"></span></div>`;
  const textarea = root.querySelector('textarea')!;
  const layer = root.querySelector<HTMLElement>('.code-highlight')!;
  const marks = root.querySelector<HTMLElement>('.code-marks')!;
  const cursorLayer = root.querySelector<HTMLElement>('.code-cursor')!;
  const lines = root.querySelector<HTMLElement>('.code-lines')!;
  textarea.value = value;
  textarea.placeholder = placeholder;
  let lineCount = 0;
  let escaped = false;

  function render() {
    // The trailing newline lets the layer scroll as far as the textarea does.
    layer.innerHTML = `${highlight(textarea.value, language)}\n\n`;
    const count = textarea.value.split('\n').length;
    if (count !== lineCount) {
      lineCount = count;
      lines.textContent = Array.from({ length: count }, (_, index) => index + 1).join(
        '\n',
      );
    }
    find.refresh();
    sync();
  }

  function sync() {
    for (const pre of [layer, marks, cursorLayer]) {
      pre.scrollTop = textarea.scrollTop;
      pre.scrollLeft = textarea.scrollLeft;
    }
    lines.style.transform = `translateY(${-textarea.scrollTop}px)`;
  }

  // The find bar is vim's search line, and vim moves to what it finds, so each needs the other:
  // the find bar gets vim through a function it only calls once both exist.
  const find = createFindBar({ root, textarea, marks, sync, vim: () => vim });
  const vim = createVim({
    root,
    textarea,
    cursorLayer,
    statusLine: root.querySelector<HTMLElement>('.code-vim')!,
    find: find.findFrom,
    openSearch: find.open,
    sync,
    active: vimPreferred(),
  });

  // execCommand keeps the browser's undo history intact, unlike setting .value.
  const insert = (text: string) => document.execCommand('insertText', false, text);

  textarea.addEventListener('input', () => {
    render();
    onChange?.(textarea.value);
  });
  textarea.addEventListener('scroll', sync);
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
    },
  };
}
