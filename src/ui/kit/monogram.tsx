// A name's chip, after T3 Code's project monogram (ProjectMonogram.tsx): two letters on a small
// tile, both worked out from the name, so nothing is stored. A group's, in the editor's rule list
// and the open rule's crumbs.
//
// - The letters: an abbreviation the name starts with ("PR 412 · checkout": PR), else the first
//   letters of its first two words ("Billing GraphQL": BG), else its first two ("Payments": PA),
//   in capitals. Drawn by CSS (attr(data-letters)), so they aren't in the page's text: a header's
//   or a crumb's words stay the name's alone, copied or read.
// - The colour: one of the theme's five (--chip-1 to --chip-5, theme.css and themes.css), the
//   name's by a hash of it; the tile is that colour at 16% over the page. Every one's letters read
//   at 4.5:1 or more on its tile, in every theme at every Contrast (test/kit.mjs checks).
// - `off`: it steps back, as a group that's off does: its letters in the grey of that group's name
//   (--t50) on a card's tile, which the grey levels' floor already holds at 4.5:1 and more.
//
// Hidden from screen readers: the name beside it says it all. Like an icon, it keeps its size
// whatever Appearance's Text size.
import { cn } from '../cn.ts';

// The five colours, as classes, so Tailwind finds them.
const COLOURS = [
  'bg-(--chip-1-tile) text-(--chip-1)',
  'bg-(--chip-2-tile) text-(--chip-2)',
  'bg-(--chip-3-tile) text-(--chip-3)',
  'bg-(--chip-4-tile) text-(--chip-4)',
  'bg-(--chip-5-tile) text-(--chip-5)',
];

export function monogramLetters(name: string) {
  const words = name.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  const [first, second] = words;
  if (!first) return Array.from(name.trim())[0] ?? '';
  const letters = Array.from(first);
  const abbreviation =
    letters.length > 1 && first === first.toUpperCase() && first !== first.toLowerCase();
  return (
    abbreviation || !second
      ? letters.slice(0, 2).join('')
      : letters[0]! + Array.from(second)[0]!
  ).toUpperCase();
}

// Which of the five colours a name has, from 1: FNV-1a over its UTF-16 code units.
export function monogramColour(name: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index++) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % COLOURS.length) + 1;
}

export function Monogram({
  name,
  off = false,
  className,
}: {
  name: string;
  off?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-slot="monogram"
      data-letters={monogramLetters(name)}
      data-colour={monogramColour(name)}
      data-off={off || undefined}
      className={cn(
        'inline-grid size-4 flex-none place-items-center rounded-[4px] text-[8px] leading-none font-semibold tracking-tight before:content-[attr(data-letters)]',
        off ? 'bg-card text-t50' : COLOURS[monogramColour(name) - 1],
        className,
      )}
    />
  );
}
