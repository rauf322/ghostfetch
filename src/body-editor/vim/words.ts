// Words, paragraphs and brackets, found the way vim's w, b, e, ge, {, } and % find them.
import {
  atLineEnd,
  lineEnd,
  lineIndex,
  next,
  onEmptyLine,
  prev,
  stepLines,
} from './text.ts';
import type { MotionResult } from './types.ts';

// A cursor that inc() and dec() move in place.
interface Cursor {
  pos: number;
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

// vim's character classes: 0 for blanks and line ends, 2 for word characters (letters, digits
// and _), 1 for other punctuation. For WORDs (W, B, E, iW) every non-blank is one class.
export function charClass(text: string, pos: number, big: boolean) {
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
export function wordForward(
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
export function wordEnd(
  text: string,
  pos: number,
  count: number,
  big: boolean,
  stay = false,
) {
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
export function wordBackward(text: string, pos: number, count: number, big: boolean) {
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
export function wordEndBackward(text: string, pos: number, count: number, big: boolean) {
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
export function paragraph(
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

export const PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  ')': '(',
  ']': '[',
  '}': '{',
};

// %: the bracket under or after the cursor on its line, and the one it pairs with.
export function matchBracket(text: string, pos: number) {
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
