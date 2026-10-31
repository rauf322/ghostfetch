// Syntax highlighting for the body editor and the read-only CodeView: JSON, or JavaScript for a
// Script body, cut into tokens that each have a colour. A long JSON body is first cut into pieces
// (chunks()), which the editor colours only while they're on screen.

export type Language = 'json' | 'js';
// A token's colour (the tk-* classes in code-editor.css), or '' for the text between tokens.
export type TokenKind = 'key' | 'str' | 'num' | 'lit' | 'kw' | 'com' | '';

const MAX_HIGHLIGHT = 200_000;
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

// How much of a body the editor colours at a time. A longer JSON body is cut into pieces of about
// this size and only the ones on screen get their colours, so a body of a megabyte types and
// scrolls like a short one.
export const CHUNK = 6000;

// A JSON body cut into pieces of about `size` characters, each of which highlights on its own
// exactly as it does inside the whole text: runs of whole lines, and a line longer than that
// (minified JSON is one line) cut after a comma outside any string. JSON's tokens never run over
// a line or a comma, except a key's colon on the next line, so a cut never goes there. A script
// stays whole: in JavaScript a comment or a template string can run over lines.
export function chunks(text: string, language: Language = 'json', size = CHUNK) {
  if (language !== 'json' || text.length <= size) return [text];
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
