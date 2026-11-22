// JSON syntax highlighting for the body editor and the read-only CodeView: the text cut into
// tokens that each have a colour. A long body is first cut into pieces (chunks()), which the
// editor colours only while they're on screen.

// A token's colour (the tk-* classes in code-editor.css), or '' for the text between tokens.
export type TokenKind = 'key' | 'str' | 'num' | 'lit' | '';

const MAX_HIGHLIGHT = 200_000;
const JSON_TOKEN =
  /("(?:\\.|[^"\\\n])*")(\s*:)?|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false|null)\b/g;

// The text cut into [kind, text] pieces, in order, for syntax highlighting. Past MAX_HIGHLIGHT
// characters it's one plain piece.
export function tokens(text: string) {
  const pieces: [TokenKind, string][] = [];
  if (text.length > MAX_HIGHLIGHT) {
    pieces.push(['', text]);
    return pieces;
  }
  let last = 0;
  for (const match of text.matchAll(JSON_TOKEN)) {
    if (match.index > last) pieces.push(['', text.slice(last, match.index)]);
    // A string followed by a colon is a key; the colon (and any space before it) stays plain.
    const [, string, colon, number, literal] = match;
    if (string) {
      pieces.push([colon ? 'key' : 'str', string]);
      if (colon) pieces.push(['', colon]);
    } else {
      pieces.push(number ? ['num', number] : ['lit', literal]);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) pieces.push(['', text.slice(last)]);
  return pieces;
}

// How much of a body the editor colours at a time. A longer JSON body is cut into pieces of about
// this size and only the ones on screen get their colours, so a body of a megabyte types and
// scrolls like a short one.
export const CHUNK = 6000;

// A body cut into pieces of about `size` characters, each of which highlights on its own exactly
// as it does inside the whole text: runs of whole lines, and a line longer than that (minified
// JSON is one line) cut after a comma outside any string. JSON's tokens never run over a line or a
// comma, except a key's colon on the next line, so a cut never goes there.
export function chunks(text: string, size = CHUNK) {
  if (text.length <= size) return [text];
  const pieces: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      let newline = text.lastIndexOf('\n', end - 1);
      while (newline >= start && keyGoesOn(text, newline))
        newline = newline > 0 ? text.lastIndexOf('\n', newline - 1) : -1;
      end = newline >= start ? newline + 1 : afterComma(text, start, end);
    }
    pieces.push(text.slice(start, end));
    start = end;
  }
  return pieces;
}

// After an edit to a body cut into pieces (chunks()): the new text's pieces, cut again only
// where the edit changed it, so the rest keep their elements in the editor. The pieces before
// `first` and after `last` stay as they are, and `fresh` takes the place of those between. A
// piece that stays starts a line, and not one a key's colon goes on to: a long line's pieces are
// cut again together, as chunks() cuts one after a comma outside a string, and an edit before
// that comma can move it into one. Typed right where two pieces meet, the text goes in with the
// piece before (or at the very start, the one after) rather than in a piece of its own.
export function rechunk(pieces: string[], text: string, size = CHUNK) {
  let first = 0;
  let at = 0;
  let last = pieces.length - 1;
  let end = text.length;
  // The pieces the text still starts with, and then those it still ends with, short of them.
  while (first <= last && text.startsWith(pieces[first]!, at))
    at += pieces[first++]!.length;
  while (
    last >= first &&
    end - pieces[last]!.length >= at &&
    text.endsWith(pieces[last]!, end)
  )
    end -= pieces[last--]!.length;
  if (first > last) {
    if (first > 0) at -= pieces[--first]!.length;
    else if (last < pieces.length - 1) end += pieces[++last]!.length;
  }
  while (first > 0 && !startsPiece(text, at)) at -= pieces[--first]!.length;
  while (last < pieces.length - 1 && !startsPiece(text, end))
    end += pieces[++last]!.length;
  return {
    first,
    last,
    fresh: at < end ? chunks(text.slice(at, end), size) : [],
  };
}

// Whether a piece that stays can start at `at`: either end of the text, or the start of a line
// that a key's colon doesn't go on to.
function startsPiece(text: string, at: number) {
  return (
    at <= 0 || at >= text.length || (text[at - 1] === '\n' && !keyGoesOn(text, at - 1))
  );
}

// Whether the line break at `newline` comes between a key and its colon.
function keyGoesOn(text: string, newline: number) {
  return /^\s*:/.test(text.slice(newline + 1, newline + 200));
}

// Where to cut a long line that runs from `start` (outside any string) past `end`: after the last
// comma outside a string before `end`, else the first one after it, else at the end of the line
// (one that a key's colon doesn't go on from).
function afterComma(text: string, start: number, end: number) {
  let inString = false;
  let last = -1;
  for (let index = start; index < text.length; index++) {
    if (index >= end && last > start) return last;
    const char = text[index];
    if (char === '\n') {
      if (!keyGoesOn(text, index)) return index + 1;
      inString = false;
    } else if (inString) {
      if (char === '\\' && text[index + 1] !== '\n') index++;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === ',') last = index + 1;
  }
  return text.length;
}
