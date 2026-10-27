// Positions in the text, as vim's motions and operators see it: whole characters (never half an
// emoji), lines and their ends, indentation, and the whole lines an operator takes.
import type { Range } from './types.ts';

const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;
// Steps over whole characters, so the cursor never lands inside an emoji's surrogate pair.
export const next = (text: string, pos: number) =>
  pos + (isLow(text.charCodeAt(pos + 1)) ? 2 : 1);
export const prev = (text: string, pos: number) =>
  pos - (pos > 1 && isLow(text.charCodeAt(pos - 1)) ? 2 : 1);

export const lineStart = (text: string, pos: number) =>
  pos > 0 ? text.lastIndexOf('\n', pos - 1) + 1 : 0;
export function lineEnd(text: string, pos: number) {
  const end = text.indexOf('\n', pos);
  return end === -1 ? text.length : end;
}
export const atLineEnd = (text: string, pos: number) =>
  pos >= text.length || text[pos] === '\n';
export const onEmptyLine = (text: string, pos: number) =>
  (pos === 0 || text[pos - 1] === '\n') && atLineEnd(text, pos);
export const column = (text: string, pos: number) => pos - lineStart(text, pos);
export function lineIndex(text: string, pos: number) {
  let index = 0;
  for (
    let at = text.indexOf('\n');
    at !== -1 && at < pos;
    at = text.indexOf('\n', at + 1)
  )
    index++;
  return index;
}
export const lastLine = (text: string) => lineIndex(text, text.length);

// The start of the line `count` lines below the one starting at `start` (above, if negative).
// `moved` is how many lines it got, which is fewer at either end of the text.
export function stepLines(text: string, start: number, count: number) {
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

export const isBlank = (char: string | undefined) => char === ' ' || char === '\t';
export function firstNonBlank(text: string, start: number) {
  let pos = start;
  while (isBlank(text[pos])) pos++;
  return pos;
}
// Whether only blanks come before pos on its line.
export const inIndent = (text: string, pos: number) =>
  /^[ \t]*$/.test(text.slice(lineStart(text, pos), pos));

// The Normal-mode cursor sits on a character: never on a line's end, except on an empty line.
export function clamp(text: string, pos: number) {
  let at = Math.max(0, Math.min(pos, text.length));
  if (atLineEnd(text, at) && at > lineStart(text, at)) at = prev(text, at);
  if (at > 0 && isLow(text.charCodeAt(at))) at--;
  return at;
}

// Whole lines, from the line of `from` through the line of `to`, with their line breaks.
export function lineSpan(text: string, from: number, to: number): Range {
  return {
    start: lineStart(text, from),
    end: Math.min(lineEnd(text, to) + 1, text.length),
    linewise: true,
  };
}

// "dd", "yy", "cc" and ">>": this line and count - 1 below it. Like vim, a count fails on the
// last line.
export function linesFrom(text: string, pos: number, count: number): Range | null {
  const start = lineStart(text, pos);
  const { start: last, moved } = stepLines(text, start, count - 1);
  return count > 1 && !moved ? null : { ...lineSpan(text, start, last), from: pos };
}

export const swapCase = (part: string) =>
  [...part]
    .map((char) =>
      char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase(),
    )
    .join('');
