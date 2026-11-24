// Text objects, the text around the cursor that an operator or a Visual selection takes: iw aw
// iW aW, i" a" (and ' and `), i( a( i[ a[ i{ a{, and ip ap.
import {
  inIndent,
  isBlank,
  lineEnd,
  lineIndex,
  lineSpan,
  lineStart,
  next,
  prev,
  stepLines,
} from './text.ts';
import type { Command, Range } from './types.ts';
import { charClass, PAIRS } from './words.ts';

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

export const BLOCKS: Record<string, string> = {
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

export function textObject(
  text: string,
  pos: number,
  { object, around, count }: Command,
) {
  if (object === 'w' || object === 'W')
    return wordObject(text, pos, count, object === 'W', around);
  if (object === '"' || object === "'" || object === '`')
    return quoteObject(text, pos, object, around);
  if (object === 'p') return paragraphObject(text, pos, count, around);
  return blockObject(text, pos, BLOCKS[object!], count, around);
}
