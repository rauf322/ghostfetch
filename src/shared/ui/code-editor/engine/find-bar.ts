// The body editor's own find bar: Cmd/Ctrl+F in the body searches the body instead of the whole
// page, marks every match on a layer under the highlighted text, and steps through them. With
// the Vim switch on it's also vim's "/" and "?" search line, and findFrom() finds the matches for
// n, N, * and #. Its elements are in the editor's markup (code-editor.ts).
import { escapeHtml } from '../../../lib/index.ts';
import type { SearchLine } from '../vim/types.ts';
import type { createVim } from '../vim/vim.ts';

const MAX_MATCHES = 1000;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isShortcut = (event: KeyboardEvent, key: string) =>
  (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === key;

interface FindBarOptions {
  root: HTMLElement;
  textarea: HTMLTextAreaElement;
  // The layer under the highlighted text, where the matches are marked.
  marks: HTMLElement;
  // Brings the editor's layers along after the textarea scrolls.
  sync: () => void;
  // The editor's vim, which it makes after the find bar: the bar is its search line, and closing
  // it in Normal or Visual mode moves vim's cursor.
  vim: () => ReturnType<typeof createVim>;
}

export function createFindBar({ root, textarea, marks, sync, vim }: FindBarOptions) {
  const findBar = root.querySelector<HTMLElement>('.code-find')!;
  const findPrompt = root.querySelector<HTMLElement>('.code-find-prompt')!;
  const findInput = root.querySelector<HTMLInputElement>('.code-find-input')!;
  const findCount = root.querySelector<HTMLElement>('.code-find-count')!;
  let matches: [number, number][] = [];
  let current = -1;
  // While the find bar is vim's "/" or "?" search line: { backward, from, then }, where `then` is
  // an operator waiting for the match ("d/foo").
  let vimSearch: SearchLine | null = null;

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
    const editorVim = vim();
    if (editorVim.active && editorVim.mode !== 'insert')
      editorVim.searched(query, match[0], { quiet: true });
    else textarea.setSelectionRange(match[0], match[1]);
  }

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
      vim().searched(query, match?.[0] ?? null, { backward, then });
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

  return {
    open: openFind,
    close: closeFind,
    get isOpen() {
      return !findBar.hidden;
    },
    findFrom,
    // Typing while the find bar is open keeps the matches up to date.
    refresh() {
      if (!findBar.hidden)
        search(matches[current]?.[0] ?? textarea.selectionStart, { scroll: false });
    },
    // A key the body got: Cmd/Ctrl+F opens the bar, and Cmd/Ctrl+G steps to the next match (with
    // Shift, the one before), or opens the bar while it's closed. True when it was one of those.
    shortcut(event: KeyboardEvent) {
      if (isShortcut(event, 'f') || (isShortcut(event, 'g') && findBar.hidden)) {
        event.preventDefault();
        openFind();
        return true;
      }
      if (isShortcut(event, 'g')) {
        event.preventDefault();
        step(event.shiftKey ? -1 : 1);
        return true;
      }
      return false;
    },
  };
}
