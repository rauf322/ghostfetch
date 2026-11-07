// Where a place in a body is once its blanks have changed (keepOffset), so that Format keeps the
// cursor on what it was on. That holds because Format (formatJson) is written to change only the
// spaces and line breaks between the tokens: every other character stays, in the same order. No
// DOM, so test/json.mjs checks the two together.

// JSON's blanks.
const blank = (char: string | undefined) =>
  char === ' ' || char === '\n' || char === '\t' || char === '\r';

// `offset` in `before`, moved to `after`: after as many characters that aren't blanks. One in the
// blanks ahead of a character on its line (a line's indent, the space after a colon) stays with
// that character, as far ahead of it as the blanks there now allow; one at the end of a line
// stays after the character it was after. Where `before` has two characters side by side that
// `after` puts blanks between (a line break before a }), `side` says which one a place between
// them stays with: a start (of a selection, or vim's block, which is on a character) with the
// one after it, an end (of a selection, or the cursor you type at) with the one before it.
export function keepOffset(
  before: string,
  after: string,
  offset: number,
  side: 'start' | 'end' = 'start',
) {
  let count = 0;
  for (let at = 0; at < offset; at++) if (!blank(before[at])) count++;
  // Just after the last of those characters in `after`.
  let at = 0;
  for (let seen = 0; seen < count && at < after.length; at++)
    if (!blank(after[at])) seen++;
  if (side === 'end' && offset > 0 && !blank(before[offset - 1])) return at;
  let next = offset;
  while (blank(before[next])) next++;
  const ahead = next < before.length && !before.slice(offset, next).includes('\n');
  if (!ahead) return at;
  let token = at;
  while (blank(after[token])) token++;
  let place = token;
  while (place > at && token - place < next - offset && after[place - 1] !== '\n')
    place--;
  return place;
}
