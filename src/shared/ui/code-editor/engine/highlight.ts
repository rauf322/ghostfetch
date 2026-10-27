// Syntax highlighting for the body editor and the read-only CodeView: JSON, or JavaScript for a
// Script body, cut into pieces that each have a colour.
import { escapeHtml } from '../../../lib/html/index.ts';

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

// The same pieces as HTML, every one of them escaped, for the editor's highlight layer.
export function highlight(text: string, language: Language = 'json') {
  return tokens(text, language)
    .map(([kind, part]) =>
      kind ? `<span class="tk-${kind}">${escapeHtml(part)}</span>` : escapeHtml(part),
    )
    .join('');
}
