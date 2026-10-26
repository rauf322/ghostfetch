// Lightweight code editor: a transparent <textarea> laid over a syntax-highlighted <pre>,
// plus a line-number gutter. Enough for JSON bodies and short transform scripts. Cmd/Ctrl+F
// inside it opens its own find bar instead of the browser's, which would search the whole page.
// With the Vim switch on, vim.ts handles its keys. Its look is code-editor.css; the React screens
// use it through src/components/code-editor.tsx.
import { escapeHtml } from '../dom.ts';
import { icon } from '../icons.ts';
import { createVim, rememberVim, vimPreferred } from './vim.ts';
import type { SearchLine } from './vim.ts';

export type Language = 'json' | 'js';
export type CodeEditor = ReturnType<typeof createCodeEditor>;
// A token's colour (the tk-* classes in code-editor.css), or '' for the text between tokens.
export type TokenKind = 'key' | 'str' | 'num' | 'lit' | 'kw' | 'com' | '';

const MAX_HIGHLIGHT = 200_000;
const MAX_MATCHES = 1000;
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const JSON_TOKEN =
  /("(?:\\.|[^"\\\n])*")(\s*:)?|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false|null)\b/g;
const JS_TOKEN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\b(\d+(?:\.\d+)?)\b|\b(const|let|var|return|if|else|for|of|in|while|function|async|await|new|true|false|null|undefined|typeof|this|try|catch|throw|delete)\b/g;

// The text cut into [kind, text] pieces, in order, for syntax highlighting. Past MAX_HIGHLIGHT
// characters it's one plain piece.
export function tokens(text: string, language: Language = 'json') {
  const pieces: [TokenKind, string][] = [];
  if (text.length > MAX_HIGHLIGHT) {
    pieces.push(['', text]);
    return pieces;
  }
  const pattern = language === 'js' ? JS_TOKEN : JSON_TOKEN;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) pieces.push(['', text.slice(last, match.index)]);
    if (language === 'js') {
      const [token, comment, string, number] = match;
      pieces.push([comment ? 'com' : string ? 'str' : number ? 'num' : 'kw', token]);
    } else {
      // A string followed by a colon is a key; the colon (and any space before it) stays plain.
      const [, string, colon, number, literal] = match;
      if (string) {
        pieces.push([colon ? 'key' : 'str', string]);
        if (colon) pieces.push(['', colon]);
      } else {
        pieces.push(number ? ['num', number] : ['lit', literal]);
      }
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) pieces.push(['', text.slice(last)]);
  return pieces;
}

// The same pieces as HTML, every one of them escaped, for the editor's highlight layer.
export function highlight(text: string, language: Language = 'json') {
  return tokens(text, language)
    .map(([kind, part]) =>
      kind ? `<span class="tk-${kind}">${escapeHtml(part)}</span>` : escapeHtml(part),
    )
    .join('');
}

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
  const findBar = root.querySelector<HTMLElement>('.code-find')!;
  const findPrompt = root.querySelector<HTMLElement>('.code-find-prompt')!;
  const findInput = root.querySelector<HTMLInputElement>('.code-find-input')!;
  const findCount = root.querySelector<HTMLElement>('.code-find-count')!;
  textarea.value = value;
  textarea.placeholder = placeholder;
  let lineCount = 0;
  let escaped = false;
  let matches: [number, number][] = [];
  let current = -1;
  // While the find bar is vim's "/" or "?" search line: { backward, from, then }, where `then` is
  // an operator waiting for the match ("d/foo").
  let vimSearch: SearchLine | null = null;

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
    // Typing while the find bar is open keeps the matches up to date.
    if (!findBar.hidden)
      search(matches[current]?.[0] ?? textarea.selectionStart, { scroll: false });
    sync();
  }

  function sync() {
    for (const pre of [layer, marks, cursorLayer]) {
      pre.scrollTop = textarea.scrollTop;
      pre.scrollLeft = textarea.scrollLeft;
    }
    lines.style.transform = `translateY(${-textarea.scrollTop}px)`;
  }

  // ------------------------------------------------------------ find

  // Marks every case-insensitive occurrence of the query; the first one at or after `from` (or,
  // for vim's "?", the last one before it) becomes the current match.
  function search(from: number, { scroll = true, backward = false } = {}) {
    const query = findInput.value;
    matches = [];
    if (query) {
      const pattern = new RegExp(escapeRegExp(query), 'gi');
      for (const match of textarea.value.matchAll(pattern)) {
        matches.push([match.index, match.index + match[0].length]);
        if (matches.length === MAX_MATCHES) break;
      }
    }
    current = backward
      ? matches.findLastIndex(([start]) => start < from)
      : matches.findIndex(([start]) => start >= from);
    if (current < 0) current = !matches.length ? -1 : backward ? matches.length - 1 : 0;
    showMatches(scroll);
  }

  // For vim's n, N, * and #: the next match after `from`, or the last one before it, wrapping
  // around the ends of the text. `word` matches whole words only.
  function findFrom(
    query: string,
    from: number,
    { backward = false, word = false } = {},
  ) {
    const text = escapeRegExp(query);
    const pattern = new RegExp(
      word ? `(?<![\\p{L}\\p{N}_])${text}(?![\\p{L}\\p{N}_])` : text,
      'giu',
    );
    let first: number | null = null;
    let last: number | null = null;
    let before: number | null = null;
    for (const { index } of textarea.value.matchAll(pattern)) {
      if (!backward && index > from) return { index, wrapped: false };
      first ??= index;
      last = index;
      if (index < from) before = index;
    }
    if (backward)
      return before !== null
        ? { index: before, wrapped: false }
        : last !== null
          ? { index: last, wrapped: true }
          : null;
    return first !== null ? { index: first, wrapped: true } : null;
  }

  function step(direction: number) {
    if (!matches.length) return;
    current = (current + direction + matches.length) % matches.length;
    showMatches(true);
  }

  function showMatches(scroll: boolean) {
    const text = textarea.value;
    let html = '';
    let last = 0;
    matches.forEach(([start, end], index) => {
      html += `${escapeHtml(text.slice(last, start))}<mark${index === current ? ' class="current"' : ''}>${escapeHtml(text.slice(start, end))}</mark>`;
      last = end;
    });
    marks.innerHTML = matches.length ? `${html}${escapeHtml(text.slice(last))}\n\n` : '';
    const query = findInput.value;
    findCount.textContent = matches.length
      ? `${current + 1} / ${matches.length}${matches.length === MAX_MATCHES ? '+' : ''}`
      : query
        ? 'No results'
        : '';
    findBar.classList.toggle('none', Boolean(query) && !matches.length);
    if (scroll) scrollToCurrent();
  }

  // Scrolls the current match into view, a third of the way down so it isn't at the very edge.
  function scrollToCurrent() {
    const mark = marks.querySelector<HTMLElement>('mark.current');
    if (!mark) return;
    const { offsetTop, offsetLeft, offsetHeight, offsetWidth } = mark;
    if (
      offsetTop < textarea.scrollTop ||
      offsetTop + offsetHeight > textarea.scrollTop + textarea.clientHeight
    ) {
      textarea.scrollTop = offsetTop - textarea.clientHeight / 3;
    }
    if (
      offsetLeft < textarea.scrollLeft ||
      offsetLeft + offsetWidth > textarea.scrollLeft + textarea.clientWidth
    ) {
      textarea.scrollLeft = Math.max(0, offsetLeft - textarea.clientWidth / 3);
    }
    sync();
  }

  // Where the find bar searches from: the cursor, or just after it for vim's "/".
  const searchStart = () =>
    vimSearch ? vimSearch.from + (vimSearch.backward ? 0 : 1) : textarea.selectionStart;

  // With `vimLine` (like vimSearch) the bar is vim's "/" or "?" search line: it starts empty,
  // searches from the cursor, and Enter goes to the match.
  function openFind(vimLine: SearchLine | null = null) {
    vimSearch = vimLine;
    findBar.classList.toggle('vim-search', Boolean(vimLine));
    findPrompt.textContent = vimLine?.backward ? '?' : '/';
    if (vimLine) {
      findInput.value = '';
    } else {
      // Like most editors, a word selected in the body becomes the query.
      const selected = textarea.value.slice(
        textarea.selectionStart,
        textarea.selectionEnd,
      );
      if (selected && !selected.includes('\n')) findInput.value = selected;
    }
    findBar.hidden = false;
    findInput.focus();
    findInput.select();
    search(searchStart(), { backward: vimLine?.backward });
  }

  // Closing returns to the body with the current match selected, ready to be typed over. In
  // vim's Normal and Visual mode the cursor goes to the match instead, and Esc on vim's search
  // line goes nowhere.
  function closeFind({ select = true } = {}) {
    const match = matches[current];
    const query = findInput.value;
    const wasVimLine = Boolean(vimSearch);
    findBar.hidden = true;
    matches = [];
    current = -1;
    marks.innerHTML = '';
    vimSearch = null;
    textarea.focus({ preventScroll: true });
    if (!select || !match || wasVimLine) return;
    if (vim.active && vim.mode !== 'insert')
      vim.searched(query, match[0], { quiet: true });
    else textarea.setSelectionRange(match[0], match[1]);
  }

  const isShortcut = (event: KeyboardEvent, key: string) =>
    (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === key;

  findInput.addEventListener('input', () => {
    search(
      vimSearch ? searchStart() : (matches[current]?.[0] ?? textarea.selectionStart),
      { backward: vimSearch?.backward },
    );
  });
  findInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && vimSearch) {
      event.preventDefault();
      const { backward, then } = vimSearch;
      const query = findInput.value;
      const match = matches[current];
      closeFind({ select: false });
      vim.searched(query, match?.[0] ?? null, { backward, then });
    } else if (event.key === 'Enter' || isShortcut(event, 'g')) {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeFind();
    } else if (isShortcut(event, 'f')) {
      event.preventDefault();
      findInput.select();
    }
  });
  findBar.addEventListener('click', (event) => {
    const action = (event.target as Element).closest<HTMLElement>('[data-find]')?.dataset
      .find;
    if (action === 'next') step(1);
    if (action === 'prev') step(-1);
    if (action === 'close') closeFind();
  });

  const vim = createVim({
    root,
    textarea,
    cursorLayer,
    statusLine: root.querySelector<HTMLElement>('.code-vim')!,
    find: findFrom,
    openSearch: openFind,
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
    if (isShortcut(event, 'f') || (isShortcut(event, 'g') && findBar.hidden)) {
      event.preventDefault();
      openFind();
      return;
    }
    if (isShortcut(event, 'g')) {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === 'Escape' && !findBar.hidden) closeFind({ select: false });
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
