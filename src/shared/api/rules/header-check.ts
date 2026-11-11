// Whether the page gets a rule's header row, as the browser decides it: a header's name is a token
// (letters, digits and ! # $ % & ' * + - . ^ _ ` | ~), its value Latin-1 text on one line, and no
// page ever sees Set-Cookie. '' when it does; else why not, in the words the rule editor shows under
// the row. The interceptor skips the rows this says no to (app/interceptor/apply-rule.ts), so the
// editor can't call a row skipped that the page gets, or the other way round. Rules reach the page
// as they're stored, so the row's fields may be anything.
import type { HeaderRow } from './types.ts';

const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function headerProblem({ op, name, value }: Partial<HeaderRow>): string {
  const header = String(name ?? '').trim();
  if (!header) return '';
  if (!TOKEN.test(header)) {
    const bad = [...header].find((char) => !TOKEN.test(char))!;
    return `Skipped: a header name can't have ${bad === ' ' ? 'a space' : `“${bad}”`} in it`;
  }
  if (op === 'remove') return '';
  if (/^set-cookie2?$/i.test(header))
    return "Skipped: a page never sees Set-Cookie, so a mock can't set a cookie";
  const text = String(value ?? '');
  if (/[\r\n]/.test(text)) return "Skipped: a header value can't have a line break";
  if (text.includes('\0')) return "Skipped: a header value can't have a NUL character";
  const wide = [...text].find((char) => char.codePointAt(0)! > 0xff);
  if (wide)
    return `Skipped: “${wide}” can't be in a header, which takes Latin-1 text only`;
  return '';
}
