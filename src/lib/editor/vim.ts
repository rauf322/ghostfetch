// Vim keys for the code editor, behind the Vim switch under each body editor: Normal, Insert,
// Visual and Visual Line modes, with motions, operators, text objects, counts, one register,
// search and "." to repeat a change. Written for this extension, which ships no third-party
// editor code, and smaller than vim on purpose: no ":" commands, macros, marks or named registers.
//
// Positions are offsets into the textarea's text. A line's "\n" (or the end of the text) is its
// end-of-line position, where vim's own motions step to after the last character. Every change
// is a single execCommand edit, so it lands in the browser's undo history the way typing does.

type Mode = 'normal' | 'insert' | 'visual' | 'visual-line';

// A cursor that inc() and dec() move in place.
interface Cursor {
  pos: number;
}

// Text an operator works on: [start, end), whole lines (with their line breaks) when
// `linewise`. `from` is where it began before it grew to whole lines.
interface Range {
  start: number;
  end: number;
  linewise?: boolean;
  from?: number;
}

// Where a motion takes the cursor. An `inclusive` motion takes in the character it lands on;
// `want` is the column j and k aim for afterwards, or `keepWant` leaves that column as it was.
interface MotionResult {
  pos: number;
  linewise?: boolean;
  inclusive?: boolean;
  want?: number;
  keepWant?: boolean;
}

interface MotionContext {
  text: string;
  pos: number;
  count: number;
  hasCount?: boolean;
  arg?: string;
  // The operator the motion is for ("d" in "dw"), if any.
  op?: string | null;
}

// A command read by parse(), e.g. "3dw" is { operator: 'd', motion: 'w', count: 3, hasCount: true }.
export interface Command {
  operator?: string;
  motion?: string;
  object?: string;
  around?: boolean;
  lines?: boolean;
  search?: string;
  action?: string;
  arg?: string;
  count: number;
  hasCount: boolean;
}

// The find bar opened as vim's "/" or "?" search line, searching from `from`; `then` is an
// operator waiting for the match ("d/foo").
export interface SearchLine {
  backward: boolean;
  from: number;
  then?: Command;
}

interface FindTarget {
  char: string;
  forward: boolean;
  till: boolean;
}

// What was typed in an Insert mode, for "." (see typedSince()).
interface Typed {
  back: number;
  forward: number;
  text: string;
}

interface Spot {
  line: number;
  column: number;
}

interface UndoStep {
  start: number;
  removed: string;
  inserted: string;
  cursor: Spot;
  inputs: number;
}

interface VimOptions {
  root: HTMLElement;
  textarea: HTMLTextAreaElement;
  cursorLayer: HTMLElement;
  statusLine: HTMLElement;
  find: (
    query: string,
    from: number,
    options?: { backward?: boolean; word?: boolean },
  ) => { index: number; wrapped: boolean } | null;
  openSearch: (line: SearchLine) => void;
  sync: () => void;
  active?: boolean;
}

const STORAGE_KEY = 'ghostfetch.vim';

// The Vim switch is one setting for every body editor, remembered in this browser.
export const vimPreferred = () => localStorage.getItem(STORAGE_KEY) === '1';
export const rememberVim = (on: boolean) =>
  localStorage.setItem(STORAGE_KEY, on ? '1' : '0');

// One unnamed register for every editor on the page: yank in one rule's body, put in another's.
const register = { text: '', linewise: false };
const MAX_PUT = 5_000_000;
const MAX_UNDO = 100;

// ------------------------------------------------------------ text

const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;
// Steps over whole characters, so the cursor never lands inside an emoji's surrogate pair.
const next = (text: string, pos: number) =>
  pos + (isLow(text.charCodeAt(pos + 1)) ? 2 : 1);
const prev = (text: string, pos: number) =>
  pos - (pos > 1 && isLow(text.charCodeAt(pos - 1)) ? 2 : 1);

const lineStart = (text: string, pos: number) =>
  pos > 0 ? text.lastIndexOf('\n', pos - 1) + 1 : 0;
function lineEnd(text: string, pos: number) {
  const end = text.indexOf('\n', pos);
  return end === -1 ? text.length : end;
}
const atLineEnd = (text: string, pos: number) => pos >= text.length || text[pos] === '\n';
const onEmptyLine = (text: string, pos: number) =>
  (pos === 0 || text[pos - 1] === '\n') && atLineEnd(text, pos);
const column = (text: string, pos: number) => pos - lineStart(text, pos);
function lineIndex(text: string, pos: number) {
  let index = 0;
  for (
    let at = text.indexOf('\n');
    at !== -1 && at < pos;
    at = text.indexOf('\n', at + 1)
  )
    index++;
  return index;
}
const lastLine = (text: string) => lineIndex(text, text.length);

// The start of the line `count` lines below the one starting at `start` (above, if negative).
// `moved` is how many lines it got, which is fewer at either end of the text.
function stepLines(text: string, start: number, count: number) {
  let pos = start;
  let moved = 0;
  while (moved < Math.abs(count)) {
    if (count > 0) {
      const end = text.indexOf('\n', pos);
      if (end === -1) break;
      pos = end + 1;
    } else {
      if (pos === 0) break;
      pos = lineStart(text, pos - 1);
    }
    moved++;
  }
  return { start: pos, moved };
}

const isBlank = (char: string | undefined) => char === ' ' || char === '\t';
function firstNonBlank(text: string, start: number) {
  let pos = start;
  while (isBlank(text[pos])) pos++;
  return pos;
}
// Whether only blanks come before pos on its line.
const inIndent = (text: string, pos: number) =>
  /^[ \t]*$/.test(text.slice(lineStart(text, pos), pos));

// The Normal-mode cursor sits on a character: never on a line's end, except on an empty line.
function clamp(text: string, pos: number) {
  let at = Math.max(0, Math.min(pos, text.length));
  if (atLineEnd(text, at) && at > lineStart(text, at)) at = prev(text, at);
  if (at > 0 && isLow(text.charCodeAt(at))) at--;
  return at;
}

// Whole lines, from the line of `from` through the line of `to`, with their line breaks.
function lineSpan(text: string, from: number, to: number): Range {
  return {
    start: lineStart(text, from),
    end: Math.min(lineEnd(text, to) + 1, text.length),
    linewise: true,
  };
}

// "dd", "yy", "cc" and ">>": this line and count - 1 below it. Like vim, a count fails on the
// last line.
function linesFrom(text: string, pos: number, count: number): Range | null {
  const start = lineStart(text, pos);
  const { start: last, moved } = stepLines(text, start, count - 1);
  return count > 1 && !moved ? null : { ...lineSpan(text, start, last), from: pos };
}

const swapCase = (part: string) =>
  [...part]
    .map((char) =>
      char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase(),
    )
    .join('');

// ------------------------------------------------------------ words, paragraphs, brackets

const WORD_CHAR = /[\p{L}\p{N}_]/u;

// vim's character classes: 0 for blanks and line ends, 2 for word characters (letters, digits
// and _), 1 for other punctuation. For WORDs (W, B, E, iW) every non-blank is one class.
function charClass(text: string, pos: number, big: boolean) {
  const code = text.codePointAt(pos);
  if (code === undefined || code === 32 || code === 9 || code === 10) return 0;
  if (big) return 1;
  return WORD_CHAR.test(String.fromCodePoint(code)) ? 2 : 1;
}

// vim's inc() and dec() on a { pos } cursor: 0 within a line, 2 when stepping onto a line's end,
// 1 when crossing into the next or previous line, -1 at either end of the text.
function inc(text: string, cursor: Cursor) {
  if (cursor.pos >= text.length) return -1;
  if (text[cursor.pos] === '\n') {
    cursor.pos += 1;
    return 1;
  }
  cursor.pos = next(text, cursor.pos);
  return atLineEnd(text, cursor.pos) ? 2 : 0;
}
function dec(text: string, cursor: Cursor) {
  if (cursor.pos <= 0) return -1;
  if (text[cursor.pos - 1] === '\n') {
    cursor.pos -= 1;
    return 1;
  }
  cursor.pos = prev(text, cursor.pos);
  return 0;
}

// vim's skip_chars(): moves past a run of one class. True when it ran into an end of the text.
function skipClass(
  text: string,
  cursor: Cursor,
  kind: number,
  big: boolean,
  forward: boolean,
) {
  while (charClass(text, cursor.pos, big) === kind) {
    if ((forward ? inc(text, cursor) : dec(text, cursor)) === -1) return true;
  }
  return false;
}

// w and W, after vim's fwd_word(). With an operator the last word stops at the end of its line,
// so "dw" on a line's last word leaves the line break alone.
function wordForward(
  text: string,
  pos: number,
  count: number,
  big: boolean,
  stopAtLineEnd: boolean,
) {
  const cursor = { pos };
  for (let left = count; left > 0; left--) {
    const stop = stopAtLineEnd && left === 1;
    const start = charClass(text, cursor.pos, big);
    let step = inc(text, cursor);
    if (step === -1 || (step >= 1 && stop)) return cursor.pos;
    if (start !== 0) {
      while (charClass(text, cursor.pos, big) === start) {
        step = inc(text, cursor);
        if (step === -1 || (step >= 1 && stop)) return cursor.pos;
      }
    }
    while (charClass(text, cursor.pos, big) === 0 && !onEmptyLine(text, cursor.pos)) {
      step = inc(text, cursor);
      if (step === -1 || (step >= 1 && stop)) return cursor.pos;
    }
  }
  return cursor.pos;
}

// e and E, after vim's end_word(). `stay` is for "cw": on the last character of a word it keeps
// to that word instead of going on to the end of the next one.
function wordEnd(text: string, pos: number, count: number, big: boolean, stay = false) {
  const cursor = { pos };
  for (let left = count; left > 0; left--) {
    const start = charClass(text, cursor.pos, big);
    if (inc(text, cursor) === -1) return cursor.pos;
    if (start !== 0 && charClass(text, cursor.pos, big) === start) {
      if (skipClass(text, cursor, start, big, true)) return cursor.pos;
    } else if (!stay || start === 0) {
      while (charClass(text, cursor.pos, big) === 0) {
        if (inc(text, cursor) === -1) return cursor.pos;
      }
      if (skipClass(text, cursor, charClass(text, cursor.pos, big), big, true))
        return cursor.pos;
    }
    dec(text, cursor);
    stay = false;
  }
  return cursor.pos;
}

// b and B, after vim's bck_word().
function wordBackward(text: string, pos: number, count: number, big: boolean) {
  const cursor = { pos };
  words: for (let left = count; left > 0; left--) {
    if (dec(text, cursor) === -1) return cursor.pos;
    while (charClass(text, cursor.pos, big) === 0) {
      if (onEmptyLine(text, cursor.pos)) continue words;
      if (dec(text, cursor) === -1) return cursor.pos;
    }
    if (skipClass(text, cursor, charClass(text, cursor.pos, big), big, false))
      return cursor.pos;
    inc(text, cursor);
  }
  return cursor.pos;
}

// ge and gE, after vim's bckend_word().
function wordEndBackward(text: string, pos: number, count: number, big: boolean) {
  const cursor = { pos };
  for (let left = count; left > 0; left--) {
    const start = charClass(text, cursor.pos, big);
    if (dec(text, cursor) === -1) return cursor.pos;
    if (start !== 0) {
      while (charClass(text, cursor.pos, big) === start) {
        if (dec(text, cursor) === -1) return cursor.pos;
      }
    }
    while (charClass(text, cursor.pos, big) === 0 && !onEmptyLine(text, cursor.pos)) {
      if (dec(text, cursor) === -1) return cursor.pos;
    }
  }
  return cursor.pos;
}

// } and {, after vim's findpar(): to the next (previous) empty line after some text, or else to
// the end (start) of the text, where "}" lands on the last character, inclusively.
function paragraph(
  text: string,
  pos: number,
  count: number,
  forward: boolean,
): MotionResult | null {
  const lines = text.split('\n');
  let line = lineIndex(text, pos);
  for (let left = count; left > 0; left--) {
    let seenText = false;
    for (let first = true; ; first = false) {
      if (lines[line] !== '') seenText = true;
      if (!first && seenText && lines[line] === '') break;
      const following = line + (forward ? 1 : -1);
      if (following < 0 || following >= lines.length) {
        if (left > 1) return null;
        break;
      }
      line = following;
    }
  }
  if (forward && line === lines.length - 1 && lines[line] !== '')
    return { pos: prev(text, text.length), inclusive: true };
  return { pos: stepLines(text, 0, line).start };
}

const PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  ')': '(',
  ']': '[',
  '}': '{',
};

// %: the bracket under or after the cursor on its line, and the one it pairs with.
function matchBracket(text: string, pos: number) {
  const end = lineEnd(text, pos);
  let at = pos;
  while (at < end && !PAIRS[text[at]]) at++;
  if (at >= end) return null;
  const same = text[at];
  const other = PAIRS[same];
  const step = '([{'.includes(same) ? 1 : -1;
  let depth = 0;
  for (let i = at; i >= 0 && i < text.length; i += step) {
    if (text[i] === same) depth++;
    else if (text[i] === other && --depth === 0) return i;
  }
  return null;
}

// ------------------------------------------------------------ text objects

// iw aw iW aW: the word (or run of blanks) under the cursor. "a" adds the blanks after it, or the
// ones before it when there are none after. A count takes in that many more.
function wordObject(
  text: string,
  pos: number,
  count: number,
  big: boolean,
  around?: boolean,
): Range | null {
  const start = lineStart(text, pos);
  const end = lineEnd(text, pos);
  if (start === end) return null;
  const kind = (at: number) => charClass(text, at, big);
  const runEnd = (at: number) => {
    const own = kind(at);
    let to = at;
    while (to < end && kind(to) === own) to = next(text, to);
    return to;
  };
  let from = pos;
  while (from > start && kind(prev(text, from)) === kind(pos)) from = prev(text, from);
  let to = runEnd(pos);
  if (around) {
    if (kind(pos) === 0) {
      if (to < end) to = runEnd(to);
    } else if (to < end && kind(to) === 0) {
      to = runEnd(to);
    } else {
      while (from > start && kind(prev(text, from)) === 0) from = prev(text, from);
    }
  }
  for (let left = count - 1; left > 0 && to < end; left--) {
    to = runEnd(to);
    if (around && to < end && kind(to) === 0) to = runEnd(to);
  }
  return { start: from, end: to };
}

// i" a" (and ' and `), after vim's current_quote(): on a quote, the string it opens or closes
// (counted from the start of the line); elsewhere, from the nearest quote before the cursor to
// the next one, or else the first string after the cursor. Quotes escaped with a backslash
// don't close a string. "a" adds blanks the way aw does.
function quoteObject(
  text: string,
  pos: number,
  quote: string,
  around?: boolean,
): Range | null {
  const start = lineStart(text, pos);
  const line = text.slice(start, lineEnd(text, pos));
  const col = pos - start;
  const nextQuote = (from: number, escapes: boolean) => {
    for (let i = from; i < line.length; i++) {
      if (escapes && line[i] === '\\') i++;
      else if (line[i] === quote) return i;
    }
    return -1;
  };
  const escaped = (i: number) => {
    let slashes = 0;
    while (i - slashes > 0 && line[i - slashes - 1] === '\\') slashes++;
    return slashes % 2 === 1;
  };
  let open = -1;
  let close = -1;
  if (line[col] === quote) {
    for (let from = 0; ; from = close + 1) {
      open = nextQuote(from, false);
      if (open < 0 || open > col) return null;
      close = nextQuote(open + 1, true);
      if (close < 0) return null;
      if (col <= close) break;
    }
  } else {
    for (let i = col - 1; i >= 0 && open < 0; i--)
      if (line[i] === quote && !escaped(i)) open = i;
    if (open < 0) open = nextQuote(col, false);
    if (open < 0) return null;
    close = nextQuote(open + 1, true);
    if (close < 0) return null;
  }
  if (!around) return { start: start + open + 1, end: start + close };
  let from = open;
  let to = close + 1;
  if (isBlank(line[to])) {
    while (isBlank(line[to])) to++;
  } else {
    while (from > 0 && isBlank(line[from - 1])) from--;
  }
  return { start: start + from, end: start + to };
}

const BLOCKS: Record<string, string> = {
  b: '(',
  '(': '(',
  ')': '(',
  '[': '[',
  ']': '[',
  B: '{',
  '{': '{',
  '}': '{',
};

// i{ a{ i[ a[ i( a(: the count-th bracket pair around the cursor; a bracket under the cursor
// counts as around it. Outside any pair, like vim 9, the count-th one after the cursor. When the
// brackets end and start their lines, as in formatted JSON, the inside is whole lines, so "di{"
// leaves "{" and "}" on lines of their own.
function blockObject(
  text: string,
  pos: number,
  open: string,
  count: number,
  around?: boolean,
): Range | null {
  const close = PAIRS[open];
  let at = pos;
  if (open === '{') while (isBlank(text[at]) && inIndent(text, at)) at++;
  if (text[at] === open) at++;
  // Fewer pairs than the count fails, as in vim.
  let start = -1;
  let found = 0;
  for (let from = at; found < count; found++) {
    let i = from - 1;
    for (let depth = 0; i >= 0; i--) {
      if (text[i] === close) depth++;
      else if (text[i] === open && depth-- === 0) break;
    }
    if (i < 0) break;
    start = i;
    from = i;
  }
  if (!found) {
    for (let from = at; found < count; found++) {
      start = text.indexOf(open, from);
      if (start < 0) break;
      from = start + 1;
    }
  }
  if (found < count) return null;
  let end = -1;
  for (let i = start + 1, depth = 0; i < text.length && end < 0; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && depth-- === 0) end = i;
  }
  if (end < 0) return null;
  if (around) return { start, end: end + 1 };
  const openLineEnd = lineEnd(text, start);
  const opensLine =
    openLineEnd < end && /^[ \t]*$/.test(text.slice(start + 1, openLineEnd));
  const closesLine = inIndent(text, end) && lineStart(text, end) > start;
  const inner = opensLine ? openLineEnd + 1 : start + 1;
  const stop = closesLine ? Math.max(inner, lineStart(text, end)) : end;
  return { start: inner, end: stop, linewise: opensLine && closesLine };
}

// ip ap, after vim's current_par(): the paragraph (or run of blank lines) under the cursor, as
// whole lines. "a" adds the blank lines after it, or the ones before it when there are none
// after. A count takes in that many more.
function paragraphObject(
  text: string,
  pos: number,
  count: number,
  around?: boolean,
): Range | null {
  const lines = text.split('\n');
  const last = lines.length - 1;
  const blank = (index: number) => /^[ \t]*$/.test(lines[index]);
  let first = lineIndex(text, pos);
  const white = blank(first);
  while (first > 0 && blank(first - 1) === white) first--;
  let end = first;
  while (end <= last && blank(end)) end++;
  end--;
  let blankNext = false;
  let blankAfter = false;
  for (let left = !around && white ? count - 1 : count; left > 0; left--) {
    if (end === last) return null;
    if (!around) blankNext = blank(end + 1);
    if (around || !blankNext) {
      end++;
      while (end < last && !blank(end + 1)) end++;
    }
    if (left === 1 && white && around) break;
    if (around || blankNext) {
      while (end < last && blank(end + 1)) {
        end++;
        blankAfter = true;
      }
    }
  }
  if (around && !white && !blankAfter) while (first > 0 && blank(first - 1)) first--;
  return lineSpan(text, stepLines(text, 0, first).start, stepLines(text, 0, end).start);
}

function textObject(text: string, pos: number, { object, around, count }: Command) {
  if (object === 'w' || object === 'W')
    return wordObject(text, pos, count, object === 'W', around);
  if (object === '"' || object === "'" || object === '`')
    return quoteObject(text, pos, object, around);
  if (object === 'p') return paragraphObject(text, pos, count, around);
  return blockObject(text, pos, BLOCKS[object!], count, around);
}

// ------------------------------------------------------------ keys and commands

const NAMED_KEYS: Record<string, string> = {
  Escape: '<Esc>',
  Enter: '<CR>',
  Backspace: '<BS>',
  Delete: '<Del>',
  ArrowLeft: '<Left>',
  ArrowRight: '<Right>',
  ArrowUp: '<Up>',
  ArrowDown: '<Down>',
  Home: '<Home>',
  End: '<End>',
  PageUp: '<PageUp>',
  PageDown: '<PageDown>',
};
const CONTROL_KEYS = new Set(['r', 'd', 'u']);

// The key in vim's notation ("w", "G", "<Esc>", "<C-r>"), or null for keys vim leaves to the
// browser: Tab, ⌘ and Alt shortcuts, Ctrl shortcuts it doesn't use, and keys that compose text.
function keyName(event: KeyboardEvent) {
  const { key } = event;
  if (event.isComposing) return null;
  if (key === 'Escape') return '<Esc>';
  if (event.metaKey) return null;
  if (event.ctrlKey) {
    if (key === '[') return '<Esc>';
    const letter = key.length === 1 ? key.toLowerCase() : '';
    return CONTROL_KEYS.has(letter) ? `<C-${letter}>` : null;
  }
  if (NAMED_KEYS[key]) return NAMED_KEYS[key];
  if (event.altKey && /^[\x20-\x7e]$/.test(key)) return null;
  return [...key].length === 1 ? key : null;
}

const PENDING = 'pending';
const OPERATORS = new Set(['d', 'c', 'y', '>', '<']);
const OBJECTS = new Set(['w', 'W', '"', "'", '`', 'p', ...Object.keys(BLOCKS)]);
const TAKES_CHARACTER = new Set(['f', 'F', 't', 'T', 'r']);
const MOTION_NAMES = new Set([
  'h',
  'l',
  'j',
  'k',
  '<Left>',
  '<Right>',
  '<Up>',
  '<Down>',
  '<BS>',
  ' ',
  'w',
  'W',
  'b',
  'B',
  'e',
  'E',
  'ge',
  'gE',
  '0',
  '^',
  '$',
  '<Home>',
  '<End>',
  'gg',
  'G',
  '+',
  '-',
  '_',
  '<CR>',
  '{',
  '}',
  '%',
  '|',
  'f',
  'F',
  't',
  'T',
  ';',
  ',',
  'n',
  'N',
  '*',
  '#',
]);
const SCROLLING = new Set(['zz', 'zt', 'zb', '<C-d>', '<C-u>', '<PageDown>', '<PageUp>']);
const ANYWHERE = [...SCROLLING, '/', '?', ':', '<Esc>'];
const NORMAL_ACTIONS = new Set([
  'i',
  'a',
  'I',
  'A',
  'o',
  'O',
  'v',
  'V',
  'x',
  '<Del>',
  'X',
  's',
  'S',
  'r',
  'D',
  'C',
  'Y',
  'J',
  'p',
  'P',
  'u',
  '<C-r>',
  '.',
  '~',
  ...ANYWHERE,
]);
const VISUAL_ACTIONS = new Set([
  'd',
  'x',
  '<Del>',
  'X',
  'D',
  'y',
  'Y',
  'c',
  's',
  'C',
  'S',
  'R',
  '>',
  '<',
  '~',
  'u',
  'U',
  'J',
  'p',
  'P',
  'r',
  'o',
  'O',
  'v',
  'V',
  ...ANYWHERE,
]);
// What "." repeats: everything that changes the text, but not yanks, undo or moves.
const CHANGES = new Set([
  'd',
  'c',
  '>',
  '<',
  'i',
  'a',
  'I',
  'A',
  'o',
  'O',
  'x',
  '<Del>',
  'X',
  's',
  'S',
  'r',
  'D',
  'C',
  'J',
  'p',
  'P',
  '~',
]);

// Reads a command from the keys typed so far: PENDING while it's incomplete, null when it can't
// be one, else { operator, motion, object, around, lines, action, arg, count, hasCount }.
function parse(keys: string[], visual: boolean): Command | typeof PENDING | null {
  let at = 0;
  const take = () => (at < keys.length ? keys[at++] : null);
  const readCount = () => {
    let digits = '';
    while (at < keys.length && /^\d$/.test(keys[at]) && (digits || keys[at] !== '0'))
      digits += keys[at++];
    return digits ? Math.min(Number(digits), 99_999) : null;
  };
  const first = readCount();
  const counted = (second: number | null = null) => ({
    count: (first ?? 1) * (second ?? 1),
    hasCount: first !== null || second !== null,
  });
  const readName = () => {
    const key = take();
    if (key !== 'g' && key !== 'z') return key;
    const more = take();
    return more === null ? null : key + more;
  };
  // A character after the command, as in "fx" or "ra".
  const withCharacter = (command: Command) => {
    if (!TAKES_CHARACTER.has(command.motion ?? command.action!)) return command;
    const arg = take();
    if (arg === null) return PENDING;
    return (arg === '<CR>' && command.action === 'r') || [...arg].length === 1
      ? { ...command, arg }
      : null;
  };
  const readObject = (prefix: string, command: Command) => {
    const object = take();
    if (object === null) return PENDING;
    return OBJECTS.has(object) ? { ...command, object, around: prefix === 'a' } : null;
  };

  const name = readName();
  if (name === null) return PENDING;
  // ":" reads a line up to Enter, for ":42" and for the ":w" habit.
  if (name === ':') {
    const line: string[] = [];
    for (let key = take(); key !== '<CR>'; key = take()) {
      if (key === null) return PENDING;
      if (key === '<Esc>') return { action: '<Esc>', ...counted() };
      if (key === '<BS>') line.pop();
      else line.push(key);
    }
    return { action: ':', arg: line.join('').trim(), ...counted() };
  }
  if (!visual && OPERATORS.has(name)) {
    const second = readCount();
    const target = readName();
    if (target === null) return PENDING;
    const command = { operator: name, ...counted(second) };
    if (target === name) return { ...command, lines: true };
    if (target === 'i' || target === 'a') return readObject(target, command);
    if (target === '/' || target === '?') return { ...command, search: target };
    return MOTION_NAMES.has(target)
      ? withCharacter({ ...command, motion: target })
      : null;
  }
  if (visual && (name === 'i' || name === 'a')) return readObject(name, counted());
  if (MOTION_NAMES.has(name)) return withCharacter({ motion: name, ...counted() });
  if ((visual ? VISUAL_ACTIONS : NORMAL_ACTIONS).has(name))
    return withCharacter({ action: name, ...counted() });
  return null;
}

// What was typed during Insert mode, as the span around the insert point it replaced, so "."
// can type it again: characters deleted before (back) and after (forward) it, and the new text.
function typedSince(
  { start, value }: { start: number; value: string },
  now: string,
): Typed {
  let prefix = 0;
  const maxPrefix = Math.min(start, now.length);
  while (prefix < maxPrefix && value.charCodeAt(prefix) === now.charCodeAt(prefix))
    prefix++;
  let suffix = 0;
  const maxSuffix = Math.min(value.length - start, now.length - prefix);
  while (
    suffix < maxSuffix &&
    value.charCodeAt(value.length - 1 - suffix) ===
      now.charCodeAt(now.length - 1 - suffix)
  )
    suffix++;
  return {
    back: start - prefix,
    forward: value.length - suffix - start,
    text: now.slice(prefix, now.length - suffix),
  };
}

// ------------------------------------------------------------ the editor's vim

const LABELS: Record<Mode, string> = {
  normal: 'Normal',
  insert: 'Insert',
  visual: 'Visual',
  'visual-line': 'V-Line',
};
// Edits vim allows in Normal and Visual mode: the browser's paste, cut, drop and undo.
const NATIVE_EDITS = new Set([
  'insertFromPaste',
  'insertFromDrop',
  'deleteByCut',
  'deleteByDrag',
  'historyUndo',
  'historyRedo',
]);

// Wires vim into a code editor. The editor lends it its textarea, a <pre> above the highlighted
// text for the block cursor, the status line, and three hooks: find(query, from, options) for
// n, N, * and #; openSearch({ backward, from, then }) to open the find bar as vim's search line,
// where `then` is an operator waiting for the match ("d/foo"); and sync() to bring the layers
// along after vim scrolls the textarea.
export function createVim({
  root,
  textarea,
  cursorLayer,
  statusLine,
  find,
  openSearch,
  sync,
  active: startActive = false,
}: VimOptions) {
  const [modeLabel, keysLabel, positionLabel] = statusLine.children;
  const before = document.createTextNode('');
  const block = document.createElement('span');
  block.className = 'cursor';
  const after = document.createTextNode('');
  let active = false;
  let mode: Mode = 'normal';
  let head = 0; // the cursor
  let anchor = 0; // the other end of a Visual selection
  let want = 0; // the column j and k aim for; Infinity after $
  let keys: string[] = [];
  let message = '';
  let editing = false;
  let lastFind: FindTarget | null = null;
  let lastSearch: { query: string; backward: boolean; word: boolean } | null = null;
  let lastChange: { command: Command; typed: Typed | null } | null = null;
  let insertion: { start: number; value: string; indented: boolean } | null = null; // where Insert mode started, to record what's typed for "."
  let replaying = false;
  // vim's undo steps, laid over the browser's history (see history()). A step is the text a
  // change replaced ({ start, removed, inserted }), the cursor to go back to, and how many inputs
  // the change took. `ongoing` is the change being made, until Esc when it opened Insert mode.
  let undoSteps: UndoStep[] = [];
  let redoSteps: UndoStep[] = [];
  let ongoing: { value: string; cursor: Spot; inputs: number } | null = null;
  let walking = false;

  const text = () => textarea.value;

  // ---------------------------------------------------------- motions

  // Each gets { text, pos, count, hasCount, arg, op } and says where the cursor goes:
  // { pos, linewise, inclusive, want, keepWant }, or null when it can't move.
  function left({ text: value, pos, count }: MotionContext): MotionResult | null {
    const start = lineStart(value, pos);
    if (pos <= start) return null;
    let at = pos;
    for (let n = 0; n < count && at > start; n++) at = prev(value, at);
    return { pos: at };
  }
  function right({ text: value, pos, count, op }: MotionContext): MotionResult | null {
    // An operator may reach the end of the line: "dl" on the last character deletes it.
    const end = lineEnd(value, pos);
    const limit = op ? end : clamp(value, end);
    if (pos >= limit) return null;
    let at = pos;
    for (let n = 0; n < count && at < limit; n++) at = next(value, at);
    return { pos: at };
  }
  // <BS> and <Space> also wrap to the previous or next line.
  function backspace({ text: value, pos, count }: MotionContext): MotionResult | null {
    let at = pos;
    for (let n = 0; n < count && at > 0; n++)
      at = value[at - 1] === '\n' ? clamp(value, at - 1) : prev(value, at);
    return at === pos ? null : { pos: at };
  }
  function space({ text: value, pos, count, op }: MotionContext): MotionResult | null {
    let at = pos;
    for (let n = 0; n < count && at < value.length; n++) {
      const end = lineEnd(value, at);
      if (op || next(value, at) < end) at = Math.min(next(value, at), end);
      else if (end < value.length) at = end + 1;
      else break;
    }
    return at === pos ? null : { pos: at };
  }
  function vertical(
    { text: value, pos, count }: MotionContext,
    direction: number,
  ): MotionResult | null {
    const { start, moved } = stepLines(value, lineStart(value, pos), direction * count);
    return moved
      ? {
          pos: Math.min(start + want, lineEnd(value, start)),
          linewise: true,
          keepWant: true,
        }
      : null;
  }
  function toLine(
    { text: value, pos }: MotionContext,
    delta: number,
  ): MotionResult | null {
    const { start, moved } = stepLines(value, lineStart(value, pos), delta);
    return moved || !delta ? { pos: firstNonBlank(value, start), linewise: true } : null;
  }
  function toLineNumber(value: string, number: number): MotionResult {
    const { start } = stepLines(value, 0, Math.min(number, lastLine(value) + 1) - 1);
    return { pos: firstNonBlank(value, start), linewise: true };
  }
  // Like vim's adjust_cursor(): a forward motion doesn't end on the end of a line.
  function forwardTo(
    value: string,
    pos: number,
    to: number,
    inclusive: boolean,
  ): MotionResult {
    if (to > pos && atLineEnd(value, to) && to > lineStart(value, to))
      return { pos: prev(value, to), inclusive: true };
    return { pos: to, inclusive };
  }
  function word(
    { text: value, pos, count, op }: MotionContext,
    big: boolean,
  ): MotionResult | null {
    // "cw" on a word changes to its end, like "ce", and only the rest of it on its last letter.
    if (op === 'c' && charClass(value, pos, big) !== 0)
      return forwardTo(value, pos, wordEnd(value, pos, count, big, true), true);
    const to = wordForward(value, pos, count, big, Boolean(op));
    return to === pos ? null : forwardTo(value, pos, to, false);
  }
  function findCharacter(
    { text: value, pos, count }: MotionContext,
    target: FindTarget,
    repeated = false,
  ): MotionResult | null {
    if (!repeated) lastFind = target;
    const { char, forward, till } = target;
    const start = lineStart(value, pos);
    const end = lineEnd(value, pos);
    let at = pos;
    // Repeating t from right before its character would stay put, so it looks one further.
    if (repeated && till && count === 1) at += forward ? 1 : -1;
    for (let n = 0; n < count; n++) {
      at = forward
        ? value.indexOf(char, at + 1)
        : at > start
          ? value.lastIndexOf(char, at - 1)
          : -1;
      if (at === -1 || at >= end || at < start) return null;
    }
    if (till) at = forward ? prev(value, at) : next(value, at);
    return { pos: at, inclusive: forward };
  }
  function searchFrom(
    from: number,
    count: number,
    reverse: boolean,
  ): MotionResult | null {
    if (!lastSearch) {
      message = 'No previous search';
      return null;
    }
    const backward = lastSearch.backward !== reverse;
    let at = from;
    let wrapped = false;
    for (let n = 0; n < count; n++) {
      const found = find(lastSearch.query, at, { backward, word: lastSearch.word });
      if (!found) {
        message = `Not found: ${lastSearch.query}`;
        return null;
      }
      wrapped ||= found.wrapped;
      at = found.index;
    }
    if (wrapped)
      message = backward
        ? 'Search hit the top, continuing at the bottom'
        : 'Search hit the bottom, continuing at the top';
    return { pos: at };
  }
  // * and #: the whole word under (or after) the cursor.
  function wordSearch(
    { text: value, pos, count }: MotionContext,
    backward: boolean,
  ): MotionResult | null {
    const end = lineEnd(value, pos);
    let start = pos;
    while (start < end && charClass(value, start, false) !== 2)
      start = next(value, start);
    if (start >= end) {
      message = 'No word under the cursor';
      return null;
    }
    while (
      start > lineStart(value, start) &&
      charClass(value, prev(value, start), false) === 2
    )
      start = prev(value, start);
    let stop = start;
    while (stop < end && charClass(value, stop, false) === 2) stop = next(value, stop);
    lastSearch = { query: value.slice(start, stop), backward, word: true };
    return searchFrom(start, count, false);
  }

  const MOTIONS: Record<string, (context: MotionContext) => MotionResult | null> = {
    h: left,
    '<Left>': left,
    l: right,
    '<Right>': right,
    '<BS>': backspace,
    ' ': space,
    j: (context) => vertical(context, 1),
    '<Down>': (context) => vertical(context, 1),
    k: (context) => vertical(context, -1),
    '<Up>': (context) => vertical(context, -1),
    '+': (context) => toLine(context, context.count),
    '<CR>': (context) => toLine(context, context.count),
    '-': (context) => toLine(context, -context.count),
    _: (context) => toLine(context, context.count - 1),
    w: (context) => word(context, false),
    W: (context) => word(context, true),
    e: ({ text: value, pos, count }) =>
      forwardTo(value, pos, wordEnd(value, pos, count, false), true),
    E: ({ text: value, pos, count }) =>
      forwardTo(value, pos, wordEnd(value, pos, count, true), true),
    b: ({ text: value, pos, count }) => ({ pos: wordBackward(value, pos, count, false) }),
    B: ({ text: value, pos, count }) => ({ pos: wordBackward(value, pos, count, true) }),
    ge: ({ text: value, pos, count }) => ({
      pos: wordEndBackward(value, pos, count, false),
      inclusive: true,
    }),
    gE: ({ text: value, pos, count }) => ({
      pos: wordEndBackward(value, pos, count, true),
      inclusive: true,
    }),
    0: ({ text: value, pos }) => ({ pos: lineStart(value, pos) }),
    '<Home>': ({ text: value, pos }) => ({ pos: lineStart(value, pos) }),
    '^': ({ text: value, pos }) => ({ pos: firstNonBlank(value, lineStart(value, pos)) }),
    $: dollar,
    '<End>': dollar,
    gg: ({ text: value, count, hasCount }) => toLineNumber(value, hasCount ? count : 1),
    G: ({ text: value, count, hasCount }) =>
      toLineNumber(value, hasCount ? count : Infinity),
    '}': ({ text: value, pos, count }) => paragraph(value, pos, count, true),
    '{': ({ text: value, pos, count }) => paragraph(value, pos, count, false),
    '%': ({ text: value, pos, count, hasCount }) => {
      if (hasCount)
        return count > 100
          ? null
          : toLineNumber(value, Math.ceil((count * (lastLine(value) + 1)) / 100));
      const to = matchBracket(value, pos);
      return to === null ? null : { pos: to, inclusive: true };
    },
    // {count}|: to that column, or the line's last character if it's shorter.
    '|': ({ text: value, pos, count }) => {
      const start = lineStart(value, pos);
      const end = lineEnd(value, pos);
      return {
        pos: Math.min(start + count - 1, end > start ? prev(value, end) : start),
        want: count - 1,
      };
    },
    f: (context) =>
      findCharacter(context, { char: context.arg!, forward: true, till: false }),
    F: (context) =>
      findCharacter(context, { char: context.arg!, forward: false, till: false }),
    t: (context) =>
      findCharacter(context, { char: context.arg!, forward: true, till: true }),
    T: (context) =>
      findCharacter(context, { char: context.arg!, forward: false, till: true }),
    ';': (context) => lastFind && findCharacter(context, lastFind, true),
    ',': (context) =>
      lastFind &&
      findCharacter(context, { ...lastFind, forward: !lastFind.forward }, true),
    n: ({ pos, count }) => searchFrom(pos, count, false),
    N: ({ pos, count }) => searchFrom(pos, count, true),
    '*': (context) => wordSearch(context, false),
    '#': (context) => wordSearch(context, true),
  };
  // $ (with a count, on a line further down). In Visual mode it takes the line break too.
  function dollar({ text: value, pos, count, op }: MotionContext): MotionResult {
    const { start } = stepLines(value, lineStart(value, pos), count - 1);
    const end = lineEnd(value, start);
    if (mode !== 'normal' && !op) return { pos: end, want: Infinity, inclusive: true };
    return {
      pos: end > start ? prev(value, end) : start,
      inclusive: end > start,
      want: Infinity,
    };
  }

  const motion = (command: Command, op: string | null = null) =>
    MOTIONS[command.motion!]({
      text: text(),
      pos: head,
      count: command.count,
      hasCount: command.hasCount,
      arg: command.arg,
      op,
    });

  // The text an operator works on, from the cursor to where the motion goes.
  const motionRange = (command: Command) => rangeTo(motion(command, command.operator));

  // `from` is where the operated text began before it grew to whole lines: a yank leaves the
  // cursor there ("yk" on the line above, "yj" where it was).
  function rangeTo(result: MotionResult | null): Range | null {
    if (!result) return null;
    const value = text();
    const from = Math.min(head, result.pos);
    let to = Math.max(head, result.pos);
    if (result.linewise) return { ...lineSpan(value, from, to), from };
    // vim's ":help exclusive": an exclusive motion that ends at the start of a later line stops
    // at the end of the line before, and takes whole lines if it began in the indentation.
    if (!result.inclusive && to > from && to === lineStart(value, to)) {
      if (inIndent(value, from)) return { ...lineSpan(value, from, to - 1), from };
      to -= 1;
    } else if (result.inclusive && to < value.length) {
      to = next(value, to);
    }
    return { start: from, end: to, linewise: false };
  }

  // ---------------------------------------------------------- edits

  // Runs a browser editing command as vim's own, so the input it fires isn't taken for typing.
  function exec(name: string, value?: string) {
    editing = true;
    try {
      return document.execCommand(name, false, value);
    } finally {
      editing = false;
    }
  }

  // One undoable edit, through the browser's editing commands like the editor's own.
  function edit(start: number, end: number, insert: string) {
    if (text().slice(start, end) === insert) return;
    textarea.setSelectionRange(start, end);
    if (insert) exec('insertText', insert);
    else exec('delete');
  }

  // Puts text in the register; lines always end with a line break there.
  function store(value: string, { start, end, linewise }: Range) {
    const part = value.slice(start, end);
    register.text = linewise && !part.endsWith('\n') ? `${part}\n` : part;
    register.linewise = Boolean(linewise);
  }

  function remove(range: Range) {
    const value = text();
    store(value, range);
    let { start } = range;
    // Deleting the last lines also takes the line break before them.
    if (
      range.linewise &&
      range.end === value.length &&
      !value.slice(start, range.end).endsWith('\n') &&
      start > 0
    )
      start -= 1;
    edit(start, range.end, '');
    const now = text();
    head = range.linewise
      ? firstNonBlank(now, lineStart(now, Math.min(start, now.length)))
      : start;
  }

  function change(range: Range) {
    const value = text();
    store(value, range);
    if (!range.linewise) {
      edit(range.start, range.end, '');
      return startInsert(range.start);
    }
    // Like vim with autoindent: type on a line of its own, at the first line's indentation.
    const part = value.slice(range.start, range.end);
    let indent = /^[ \t]*/.exec(part)![0];
    if (!part) indent = `${/^[ \t]*/.exec(value.slice(range.start))![0]}  `; // the inside of an empty block
    const breakAfter = !part || part.endsWith('\n') ? '\n' : '';
    edit(range.start, range.end, indent + breakAfter);
    return startInsert(range.start + indent.length, { indented: true });
  }

  // The cursor goes to the start of what was yanked: "yb" and "yiw" move it, "yy" and "yj" don't.
  function yank(range: Range) {
    store(text(), range);
    head = range.from ?? range.start;
  }

  // > and <: by two spaces, like the editor's Tab. Empty lines stay empty.
  function shift(range: Range, direction: number, times: number) {
    const part = text().slice(range.start, range.end);
    const lines = part.split('\n');
    const shifted = lines
      .map((line, index) => {
        if (index === lines.length - 1 && part.endsWith('\n')) return line;
        if (direction > 0) return line ? '  '.repeat(times) + line : line;
        let out = line;
        for (let n = 0; n < times; n++) out = out.replace(/^(?: {1,2}|\t)/, '');
        return out;
      })
      .join('\n');
    edit(range.start, range.end, shifted);
    head = firstNonBlank(text(), range.start);
  }

  function apply(operator: string, range: Range) {
    // Nothing to work on ("di(" in "()"): only c still starts Insert mode there.
    if (range.start === range.end && operator !== 'c') return;
    changeStartsAt(range.from ?? range.start);
    if (operator === 'd') remove(range);
    else if (operator === 'c') change(range);
    else if (operator === 'y') yank(range);
    // > and < always shift whole lines, whatever the motion.
    else
      shift(
        range.linewise
          ? range
          : lineSpan(text(), range.start, Math.max(range.start, range.end - 1)),
        operator === '>' ? 1 : -1,
        1,
      );
  }

  function put(afterCursor: boolean, count: number) {
    if (!register.text) {
      message = 'Nothing to put';
      return;
    }
    if (register.text.length * count > MAX_PUT) {
      message = 'Too much to put';
      return;
    }
    const value = text();
    const content = register.text.repeat(count);
    if (register.linewise) {
      if (!afterCursor) {
        const start = lineStart(value, head);
        edit(start, start, content);
        head = firstNonBlank(text(), start);
        return;
      }
      const end = lineEnd(value, head);
      // After the last line, the line break goes before the new lines instead of after them.
      if (end === value.length) edit(end, end, `\n${content.slice(0, -1)}`);
      else edit(end + 1, end + 1, content);
      head = firstNonBlank(text(), end + 1);
      return;
    }
    const at = afterCursor && !atLineEnd(value, head) ? next(value, head) : head;
    edit(at, at, content);
    // On the last character put, or at the start of what was put when it spans lines.
    head = content.includes('\n') ? at : at + content.length - 1;
  }

  // Visual p and P: the selection is replaced by the register; p puts the replaced text in it.
  function putOver(range: Range, keepRegister: boolean) {
    if (!register.text) {
      message = 'Nothing to put';
      return;
    }
    const value = text();
    const replaced = value.slice(range.start, range.end);
    let content = register.text;
    if (range.linewise && !register.linewise) content += '\n';
    if (!range.linewise && register.linewise) content = `\n${content}`;
    if (range.linewise && !replaced.endsWith('\n')) content = content.replace(/\n$/, '');
    edit(range.start, range.end, content);
    if (!keepRegister) store(value, range);
    head = range.linewise
      ? firstNonBlank(text(), range.start)
      : range.start + Math.max(0, content.length - 1);
  }

  // J: joins count lines, dropping the next line's indentation and putting one space between,
  // unless the line already ends in a blank or the next one starts with ")". The cursor goes to
  // the last join.
  function join(pos: number, count: number) {
    const value = text();
    const start = lineStart(value, pos);
    let end = lineEnd(value, start);
    let joined = value.slice(start, end);
    let cursor = -1;
    for (let n = 1; n < count && end < value.length; n++) {
      const nextEnd = lineEnd(value, end + 1);
      const following = value.slice(end + 1, nextEnd).replace(/^[ \t]+/, '');
      const gap =
        following && !following.startsWith(')') && joined && !/[ \t]$/.test(joined)
          ? ' '
          : '';
      cursor = joined.length;
      joined += gap + following;
      end = nextEnd;
    }
    if (cursor < 0) return;
    edit(start, end, joined);
    head = start + cursor;
  }

  function replaceCharacters(count: number, char: string) {
    const value = text();
    const end = lineEnd(value, head);
    let stop = head;
    for (let n = 0; n < count; n++) {
      if (stop >= end) return; // not that many characters left: vim does nothing
      stop = next(value, stop);
    }
    if (char === '<CR>') {
      edit(head, stop, '\n');
      head += 1;
    } else {
      edit(head, stop, char.repeat(count));
      head += char.length * (count - 1);
    }
  }

  // ~ in Normal mode: toggles the case of count characters and moves past them.
  function toggleCase(count: number) {
    const value = text();
    const end = lineEnd(value, head);
    if (head >= end) return;
    let stop = head;
    for (let n = 0; n < count && stop < end; n++) stop = next(value, stop);
    edit(head, stop, swapCase(value.slice(head, stop)));
    head = stop;
  }

  // x, s: count characters from the cursor, not past the end of the line.
  function characters(count: number): Range {
    const value = text();
    const end = lineEnd(value, head);
    let stop = head;
    for (let n = 0; n < count && stop < end; n++) stop = next(value, stop);
    return { start: head, end: stop, linewise: false };
  }

  // o and O: a new line with this line's indentation, one level deeper inside a bracket that
  // opens at the end of this line (for o) or closes at its start (for O), like the editor's Enter.
  function openLine(below: boolean) {
    const value = text();
    const start = lineStart(value, head);
    const end = lineEnd(value, head);
    const line = value.slice(start, end);
    let indent = /^[ \t]*/.exec(line)![0];
    if (below ? /[{[(][ \t]*$/.test(line) : /^[ \t]*[}\])]/.test(line)) indent += '  ';
    if (below) {
      edit(end, end, `\n${indent}`);
      startInsert(end + 1 + indent.length, { indented: true });
    } else {
      edit(start, start, `${indent}\n`);
      startInsert(start + indent.length, { indented: true });
    }
  }

  // ---------------------------------------------------------- undo

  const spot = (pos: number): Spot => ({
    line: lineIndex(text(), pos),
    column: column(text(), pos),
  });

  function beginChange() {
    ongoing = { value: text(), cursor: spot(head), inputs: 0 };
  }

  // Where vim's cursor stands when the change starts, which is where u brings it back: an
  // operator starts at the text it works on, A at the end of the line.
  function changeStartsAt(pos: number) {
    if (ongoing) ongoing.cursor = spot(pos);
  }

  // Where u and Ctrl+R leave the cursor, as in vim: where the change started, when that's on the
  // first line it touched (or the line above it, after o), else that line's first non-blank.
  function cursorAfter(step: UndoStep) {
    const value = text();
    let line = lineIndex(value, step.start);
    if (step.cursor.line + 1 === line) line = step.cursor.line;
    const start = stepLines(value, 0, line).start;
    return line === step.cursor.line
      ? Math.min(start + step.cursor.column, lineEnd(value, start))
      : firstNonBlank(value, start);
  }

  // Records the change just made as one undo step, if it changed anything.
  function endChange() {
    if (!ongoing) return;
    const { value, cursor, inputs } = ongoing;
    ongoing = null;
    const now = text();
    if (now === value) return;
    let start = 0;
    while (start < value.length && value[start] === now[start]) start++;
    let same = 0;
    while (
      same < Math.min(value.length, now.length) - start &&
      value[value.length - 1 - same] === now[now.length - 1 - same]
    )
      same++;
    undoSteps.push({
      start,
      removed: value.slice(start, value.length - same),
      inserted: now.slice(start, now.length - same),
      cursor,
      inputs,
    });
    if (undoSteps.length > MAX_UNDO) undoSteps.shift();
    redoSteps = [];
  }

  // The text changed without vim (⌘Z, a paste, Format): its steps no longer match the history.
  function forgetSteps() {
    undoSteps = [];
    redoSteps = [];
    ongoing = null;
  }

  // One step of the browser's history. Chrome keeps one history for the whole page, so a step
  // that turns out to belong to another field is put back. False if the body didn't change.
  function browserStep(name: 'undo' | 'redo') {
    const previous = text();
    if (!exec(name)) return false;
    if (text() !== previous) return true;
    exec(name === 'undo' ? 'redo' : 'undo');
    textarea.focus({ preventScroll: true });
    return false;
  }

  // Takes browser steps until the body is `target`, at most `limit` of them (the inputs the change
  // took), and redraws the editor once at the end instead of after every step.
  function walk(name: 'undo' | 'redo', target: string, limit: number) {
    walking = true;
    let reached = false;
    try {
      for (let n = 0; n < limit && !reached && browserStep(name); n++)
        reached = text() === target;
    } finally {
      walking = false;
    }
    editing = true;
    textarea.dispatchEvent(new Event('input'));
    editing = false;
    return reached;
  }

  // u and Ctrl+R. A change, with the Insert mode it opened, is one step, however many the
  // browser made of it: Chrome makes one per typed letter in this editor, Firefox makes "cw" and
  // the typing two. When vim has no step of its own that fits, it takes the browser's.
  function history(name: 'undo' | 'redo', count: number) {
    const undo = name === 'undo';
    let done = 0;
    for (; done < count; done++) {
      const steps = undo ? undoSteps : redoSteps;
      const step = steps.at(-1);
      const [from, to] = undo
        ? [step?.inserted, step?.removed]
        : [step?.removed, step?.inserted];
      const now = text();
      if (step && now.startsWith(from!, step.start)) {
        if (
          !walk(
            name,
            now.slice(0, step.start) + to + now.slice(step.start + from!.length),
            step.inputs + 1,
          )
        ) {
          forgetSteps();
          break;
        }
        steps.pop();
        (undo ? redoSteps : undoSteps).push(step);
        head = cursorAfter(step);
      } else {
        forgetSteps();
        if (!browserStep(name)) break;
        head = textarea.selectionStart;
      }
    }
    if (!done) message = undo ? 'Already at oldest change' : 'Already at newest change';
  }

  // The ":" line: ":42" goes to line 42. Everything saves as you type, so ":w" just says so.
  function exCommand(line: string) {
    if (/^\d+$/.test(line)) {
      head = toLineNumber(text(), Math.max(1, Number(line))).pos;
    } else if (/^(?:w|wa|wq|wqa|x|xa|up|update|q|qa)!?$/.test(line)) {
      message = 'Changes save automatically';
    } else if (line) {
      message = `Not supported: :${line}`;
    }
  }

  // . : runs the last change again, typing what was typed in its Insert mode.
  function repeat(count: number | null) {
    if (!lastChange) return;
    const { command, typed } = lastChange;
    replaying = true;
    try {
      runNormal(count ? { ...command, count, hasCount: true } : command);
      if (mode === 'insert') {
        if (typed) {
          const at = textarea.selectionStart;
          edit(Math.max(0, at - typed.back), at + typed.forward, typed.text);
        }
        leaveInsert();
      }
    } finally {
      replaying = false;
    }
  }

  // ---------------------------------------------------------- modes

  function setMode(to: Mode) {
    mode = to;
    root.dataset.vim = to;
  }

  // `indented`: the command put in the indentation (o, O, cc, S), which goes again at Esc if
  // nothing was typed on the line, as with vim's autoindent.
  function startInsert(pos: number, { indented = false } = {}) {
    setMode('insert');
    textarea.setSelectionRange(pos, pos);
    insertion = { start: pos, value: text(), indented };
  }

  // Esc: back to Normal mode, one character to the left, as in vim.
  function leaveInsert() {
    if (insertion && lastChange && !replaying)
      lastChange.typed = typedSince(insertion, text());
    let caret = textarea.selectionStart;
    if (insertion?.indented) {
      const start = lineStart(text(), caret);
      const end = lineEnd(text(), caret);
      if (start < end && /^[ \t]+$/.test(text().slice(start, end))) {
        edit(start, end, '');
        caret = start;
      }
    }
    insertion = null;
    const value = text();
    head = caret > lineStart(value, caret) ? prev(value, caret) : caret;
    setMode('normal');
    if (!replaying) endChange();
  }

  function startVisual(kind: Mode) {
    anchor = head;
    setMode(kind);
  }

  function selection(): Range {
    const value = text();
    const from = Math.min(anchor, head);
    const to = Math.max(anchor, head);
    if (mode === 'visual-line') return lineSpan(value, from, to);
    return {
      start: from,
      end: to < value.length ? next(value, to) : to,
      linewise: false,
    };
  }

  // The lines a Visual selection touches, for X, D, Y, C, S, R, J, > and <.
  function selectedLines() {
    return lineSpan(text(), Math.min(anchor, head), Math.max(anchor, head));
  }

  // ---------------------------------------------------------- running commands

  function scroll(name: string, count: number) {
    const style = getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight);
    const visible = Math.max(1, Math.floor(textarea.clientHeight / lineHeight));
    if (name === 'zz' || name === 'zt' || name === 'zb') {
      const top = parseFloat(style.paddingTop) + lineIndex(text(), head) * lineHeight;
      const margin = scrollMargin(lineHeight);
      if (name === 'zt') textarea.scrollTop = top - margin;
      else if (name === 'zb')
        textarea.scrollTop = top + lineHeight + margin - textarea.clientHeight;
      else textarea.scrollTop = top - (textarea.clientHeight - lineHeight) / 2;
      return sync();
    }
    // Ctrl+D and Ctrl+U move half a screen, PageDown and PageUp a whole one less two lines.
    const lines =
      name === '<C-d>' || name === '<C-u>'
        ? Math.max(1, Math.floor(visible / 2))
        : Math.max(1, visible - 2) * count;
    const direction = name === '<C-d>' || name === '<PageDown>' ? 1 : -1;
    const result = vertical({ text: text(), pos: head, count: lines }, direction);
    if (!result) return undefined;
    textarea.scrollTop += direction * lines * lineHeight;
    head = want === Infinity ? result.pos : clamp(text(), result.pos);
    return sync();
  }

  function runNormal(command: Command) {
    const value = text();
    if (command.motion && !command.operator) {
      const result = motion(command);
      if (!result) return;
      head = result.pos;
      want = result.want ?? (result.keepWant ? want : column(value, clamp(value, head)));
      return;
    }
    if (command.operator) {
      // "d/foo": the operator waits on the search line and runs when it's confirmed.
      if (command.search)
        return openSearch({
          backward: command.search === '?',
          from: head,
          then: command,
        });
      const range = command.lines
        ? linesFrom(value, head, command.count)
        : command.object
          ? textObject(value, head, command)
          : motionRange(command);
      if (!range) return;
      // "dd", "cc", ">>" and "<<" start from the line's first non-blank, as in vim; "yy" stays put.
      if (command.lines && command.operator !== 'y')
        range.from = firstNonBlank(value, range.start);
      apply(command.operator, range);
    } else {
      const { count } = command;
      // i, a, I and A start their change where they type; o and O where the cursor was.
      const typeAt = (pos: number) => {
        changeStartsAt(pos);
        startInsert(pos);
      };
      const actions: Record<string, () => void> = {
        i: () => typeAt(head),
        a: () => typeAt(atLineEnd(value, head) ? head : next(value, head)),
        I: () => typeAt(firstNonBlank(value, lineStart(value, head))),
        A: () => typeAt(lineEnd(value, head)),
        o: () => openLine(true),
        O: () => openLine(false),
        v: () => startVisual('visual'),
        V: () => startVisual('visual-line'),
        x: () => apply('d', characters(count)),
        '<Del>': () => apply('d', characters(count)),
        X: () => {
          const start = lineStart(value, head);
          let from = head;
          for (let n = 0; n < count && from > start; n++) from = prev(value, from);
          apply('d', { start: from, end: head, linewise: false });
        },
        s: () => apply('c', characters(count)),
        S: () => {
          const range = linesFrom(value, head, count);
          if (range) apply('c', { ...range, from: firstNonBlank(value, range.start) });
        },
        r: () => replaceCharacters(count, command.arg!),
        D: () => apply('d', motionRange({ ...command, operator: 'd', motion: '$' })!),
        C: () => apply('c', motionRange({ ...command, operator: 'c', motion: '$' })!),
        Y: () => {
          const range = linesFrom(value, head, count);
          if (range) yank(range);
        },
        J: () => join(head, Math.max(2, count)),
        p: () => put(true, count),
        P: () => put(false, count),
        u: () => history('undo', count),
        '<C-r>': () => history('redo', count),
        '.': () => repeat(command.hasCount ? count : null),
        '~': () => toggleCase(count),
        '/': () => openSearch({ backward: false, from: head }),
        '?': () => openSearch({ backward: true, from: head }),
        ':': () => exCommand(command.arg!),
      };
      if (actions[command.action!]) actions[command.action!]();
      else if (SCROLLING.has(command.action!)) return scroll(command.action!, count);
    }
    // After an edit, j and k aim for the column the cursor ended up in.
    if (mode !== 'insert') want = column(text(), clamp(text(), head));
    if (CHANGES.has(command.operator ?? command.action!) && !replaying)
      lastChange = { command, typed: null };
    return undefined;
  }

  function runVisual(command: Command) {
    const value = text();
    if (command.motion) {
      const result = motion(command);
      if (!result) return;
      // After $ the cursor keeps to the ends of lines, line breaks included.
      const keepEnd = result.want === Infinity || (result.keepWant && want === Infinity);
      head = keepEnd ? Math.min(result.pos, value.length) : clamp(value, result.pos);
      want = result.want ?? (result.keepWant ? want : column(value, head));
      return;
    }
    if (command.object) {
      const range = textObject(value, head, command);
      if (!range || range.end <= range.start) return;
      // Like vim, a text object makes the selection characterwise, except a paragraph.
      setMode(command.object === 'p' ? 'visual-line' : 'visual');
      anchor = range.start;
      head = prev(value, range.end);
      want = column(value, head);
      return;
    }
    visualAction(command, value);
    if (mode !== 'insert' && !SCROLLING.has(command.action!))
      want = column(text(), clamp(text(), head));
  }

  function visualAction(command: Command, value: string) {
    const { action, count } = command;
    const range = selection();
    const lines = selectedLines();
    const lineCount =
      lineIndex(value, Math.max(lines.start, lines.end - 1)) -
      lineIndex(value, lines.start) +
      1;
    // Back to Normal mode at the start of the selection. For lines that's the first column of the
    // line the selection began on, unless it was extended upward, as in vim.
    const leave = (linewise = mode === 'visual-line') => {
      head =
        linewise && head >= lineStart(value, anchor)
          ? lineStart(value, anchor)
          : Math.min(anchor, head);
      setMode('normal');
      changeStartsAt(head);
    };
    // Linewise changes are remembered for "." as the same change on as many lines.
    const remember = (operator: string) => {
      if (!replaying)
        lastChange = {
          command: { operator, lines: true, count: lineCount, hasCount: true },
          typed: null,
        };
    };
    const recase = (convert: (part: string) => string) => {
      leave();
      edit(range.start, range.end, convert(value.slice(range.start, range.end)));
    };
    switch (action) {
      case 'd':
      case 'x':
      case '<Del>':
        leave();
        if (range.linewise) remember('d');
        return remove(range);
      case 'X':
      case 'D':
        leave(true);
        remember('d');
        return remove(lines);
      case 'y':
        leave();
        return store(value, range);
      case 'Y':
        leave(true);
        return store(value, lines);
      case 'c':
      case 's':
        leave();
        if (range.linewise) remember('c');
        return change(range);
      case 'C':
      case 'S':
      case 'R':
        leave(true);
        remember('c');
        return change(lines);
      case '>':
      case '<':
        leave();
        remember(action);
        return shift(lines, action === '>' ? 1 : -1, count);
      case '~':
        return recase(swapCase);
      case 'u':
        return recase((part) => part.toLowerCase());
      case 'U':
        return recase((part) => part.toUpperCase());
      case 'J':
        leave();
        return join(lines.start, Math.max(2, lineCount));
      case 'p':
      case 'P':
        leave();
        return putOver(range, action === 'P');
      case 'r':
        if (command.arg === '<CR>') return undefined;
        leave();
        return edit(
          range.start,
          range.end,
          // Array.from() splits it into characters, not UTF-16 units, so an emoji is one.
          Array.from(value.slice(range.start, range.end), (char) =>
            char === '\n' ? char : command.arg,
          ).join(''),
        );
      case 'o':
      case 'O':
        [anchor, head] = [head, anchor];
        return undefined;
      case 'v':
      case 'V': {
        const kind = action === 'v' ? 'visual' : 'visual-line';
        if (mode === kind) setMode('normal');
        else setMode(kind);
        return undefined;
      }
      case '<Esc>':
        setMode('normal');
        return undefined;
      case ':':
        setMode('normal');
        return exCommand(command.arg!);
      case '/':
      case '?':
        return openSearch({ backward: action === '?', from: head });
      default:
        return scroll(action!, count);
    }
  }

  // ---------------------------------------------------------- showing it

  function scrollMargin(lineHeight: number) {
    return Math.min(
      2 * lineHeight,
      Math.max(0, (textarea.clientHeight - lineHeight) / 2),
    );
  }

  // Shows the cursor (Normal) or the selection (Visual) on the textarea itself.
  function place() {
    const value = text();
    if (mode === 'normal') {
      head = clamp(value, head);
      textarea.setSelectionRange(head, head);
    } else if (mode !== 'insert') {
      const { start, end } = selection();
      textarea.setSelectionRange(start, end, head < anchor ? 'backward' : 'forward');
    }
  }

  function paint() {
    if (!active) return;
    const value = text();
    root.dataset.vim = mode;
    if (mode === 'insert') {
      cursorLayer.replaceChildren();
    } else {
      // The layer holds the whole text, invisible, so the block lands exactly on its character.
      const size = atLineEnd(value, head) ? 0 : next(value, head) - head;
      before.data = value.slice(0, head);
      block.textContent = size ? value.slice(head, head + size) : ' ';
      after.data = `${value.slice(head + size)}\n\n`;
      if (block.parentNode !== cursorLayer)
        cursorLayer.replaceChildren(before, block, after);
    }
    modeLabel.textContent = LABELS[mode];
    let detail = message || keys.join('');
    if (!detail && mode !== 'normal' && mode !== 'insert') {
      const { start, end } = selection();
      const lines =
        lineIndex(value, Math.max(start, end - 1)) - lineIndex(value, start) + 1;
      const chars = Array.from(value.slice(start, end)).length;
      detail =
        mode === 'visual-line' || lines > 1
          ? `${lines} ${lines === 1 ? 'line' : 'lines'}`
          : `${chars} ${chars === 1 ? 'char' : 'chars'}`;
    }
    keysLabel.textContent = detail;
    keysLabel.classList.toggle('message', Boolean(message));
    const at = mode === 'insert' ? textarea.selectionStart : head;
    positionLabel.textContent = `Ln ${lineIndex(value, at) + 1}, Col ${column(value, at) + 1}`;
  }

  // Scrolls the textarea so the cursor stays in view, two lines from the edge where it can.
  function reveal() {
    if (mode === 'insert' || !block.isConnected) return;
    const style = getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight);
    const margin = scrollMargin(lineHeight);
    const top = parseFloat(style.paddingTop) + lineIndex(text(), head) * lineHeight;
    if (top - margin < textarea.scrollTop) textarea.scrollTop = top - margin;
    else if (top + lineHeight + margin > textarea.scrollTop + textarea.clientHeight)
      textarea.scrollTop = top + lineHeight + margin - textarea.clientHeight;
    const leftEdge = block.offsetLeft - parseFloat(style.paddingLeft);
    const rightEdge =
      block.offsetLeft + block.offsetWidth + parseFloat(style.paddingRight);
    if (leftEdge < textarea.scrollLeft) textarea.scrollLeft = leftEdge;
    else if (rightEdge > textarea.scrollLeft + textarea.clientWidth)
      textarea.scrollLeft = rightEdge - textarea.clientWidth;
    sync();
  }

  function finish() {
    place();
    paint();
    reveal();
  }

  // ---------------------------------------------------------- events

  // Handles a keydown in the textarea. Returns true when the editor should leave the key alone:
  // vim used it, or it belongs to the browser (Tab, ⌘C...). In Insert mode only Esc is vim's.
  function keydown(event: KeyboardEvent) {
    if (!active) return false;
    const key = keyName(event);
    if (mode === 'insert') {
      if (key !== '<Esc>') return false;
      event.preventDefault();
      leaveInsert();
      finish();
      return true;
    }
    if (key === null) {
      // A browser or system shortcut: let it happen, then take over the selection it leaves.
      if (event.key !== 'Tab') setTimeout(adopt);
      return true;
    }
    event.preventDefault();
    message = '';
    keys.push(key);
    const command = parse(keys, mode !== 'normal');
    if (command === PENDING) {
      paint();
      return true;
    }
    keys = [];
    if (command) {
      // Every command but u and Ctrl+R may be a change: one undo step, ending at Esc if it
      // opens Insert mode.
      const moving =
        mode === 'normal' && (command.action === 'u' || command.action === '<C-r>');
      if (!moving) beginChange();
      if (mode === 'normal') runNormal(command);
      else runVisual(command);
      // (The command may have started Insert mode, which TypeScript can't see through the call.)
      if ((mode as Mode) !== 'insert') endChange();
    }
    finish();
    return true;
  }

  // Takes over a selection something else made: a click or a drag, ⌘A, a browser shortcut.
  // A selection with text in it becomes Visual mode.
  function adopt() {
    if (!active || editing) return;
    if (mode === 'insert') {
      paint();
      return;
    }
    const value = text();
    const { selectionStart: start, selectionEnd: end } = textarea;
    const shown = mode === 'normal' ? { start: head, end: head } : selection();
    if (start === shown.start && end === shown.end) {
      paint();
      return;
    }
    keys = [];
    if (start === end) {
      setMode('normal');
      head = start;
    } else {
      setMode('visual');
      const backward = textarea.selectionDirection === 'backward';
      anchor = backward ? prev(value, end) : start;
      head = backward ? start : prev(value, end);
    }
    want = column(value, clamp(value, head));
    finish();
  }

  // The text changed without vim: a paste, cut, drop or ⌘Z carries on in Normal mode at the
  // start of the change. In Insert mode it only updates the status line.
  function changed(event: Event) {
    if (walking) {
      // Mid-walk through the history: the editor redraws once, after the last step.
      event.stopImmediatePropagation();
      return;
    }
    if (ongoing) ongoing.inputs += 1;
    if (!active || editing) return;
    if (mode === 'insert') {
      if ((event as InputEvent).inputType?.startsWith('history')) forgetSteps();
      paint();
      return;
    }
    forgetSteps();
    keys = [];
    setMode('normal');
    head = textarea.selectionStart;
    want = column(text(), clamp(text(), head));
    finish();
  }

  // Registered before the editor's own listener, so a walk can hold back its redraws.
  textarea.addEventListener('input', changed);
  textarea.addEventListener('focus', adopt);
  textarea.addEventListener('mouseup', adopt);
  textarea.addEventListener('keyup', () => {
    if (active && mode === 'insert') paint();
  });
  // Keeps stray typing out of Normal and Visual mode: Mac's Ctrl text shortcuts (Ctrl+K, Ctrl+H)
  // and dead keys reach the textarea without a keydown vim could stop.
  textarea.addEventListener('beforeinput', (event) => {
    if (active && mode !== 'insert' && !editing && !NATIVE_EDITS.has(event.inputType))
      event.preventDefault();
  });

  function setActive(on: boolean) {
    active = on;
    statusLine.hidden = !on;
    keys = [];
    message = '';
    insertion = null;
    forgetSteps();
    if (!on) {
      delete root.dataset.vim;
      cursorLayer.replaceChildren();
      return;
    }
    const value = text();
    setMode('normal');
    head = clamp(value, textarea.selectionStart);
    want = column(value, head);
    if (document.activeElement === textarea) place();
    paint();
  }

  // The find bar's search line closed with a match (Enter after / or ?), or the ⌘F bar closed in
  // Normal or Visual mode: go there, and let n and N carry on with that query. After "d/" and
  // the like (`then`), the operator runs up to the match instead, and "." repeats it as "dn".
  function searched(
    query: string,
    index: number | null,
    {
      backward = false,
      quiet = false,
      then = null,
    }: { backward?: boolean; quiet?: boolean; then?: Command | null } = {},
  ) {
    if (!active || mode === 'insert' || !query) return;
    lastSearch = { query, backward, word: false };
    keys = [];
    message = '';
    if (index == null) {
      message = `Not found: ${query}`;
    } else if (then) {
      const range = rangeTo({ pos: index });
      beginChange();
      if (range) apply(then.operator!, range);
      // ("c/foo" starts Insert mode, which TypeScript can't see through the call.)
      if ((mode as Mode) !== 'insert') {
        endChange();
        want = column(text(), clamp(text(), head));
      }
      if (CHANGES.has(then.operator!))
        lastChange = {
          command: { operator: then.operator, motion: 'n', count: 1, hasCount: false },
          typed: null,
        };
    } else {
      if (!quiet && (backward ? index >= head : index <= head)) {
        message = backward
          ? 'Search hit the top, continuing at the bottom'
          : 'Search hit the bottom, continuing at the top';
      }
      head = index;
      want = column(text(), index);
    }
    finish();
  }

  if (startActive) {
    // A fresh editor starts at the top, like a file opened in vim.
    textarea.setSelectionRange(0, 0);
    setActive(true);
  }

  return {
    get active() {
      return active;
    },
    get mode() {
      return mode;
    },
    setActive,
    keydown,
    searched,
  };
}
