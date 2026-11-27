// A key's badge, as in a tooltip's "Hide the sidebar ⌘B" and the search field's "/"; and the one
// place that knows this platform's command key, ⌘ on a Mac and Ctrl elsewhere, as code editors
// have it: modKey() writes a shortcut with it, modKeyName() names it for aria-keyshortcuts,
// spokenKeys() says a written key in words, and modPressed() reads it from a key event, with
// pressedLetter() for the shortcut's letter, whatever the layout.
import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';

const MAC = /Mac/.test(navigator.userAgent);

// A shortcut with the command key, as this platform writes it: ⌘B on a Mac, Ctrl+B elsewhere.
export const modKey = (key: string) => (MAC ? `⌘${key}` : `Ctrl+${key}`);

// The same, as aria-keyshortcuts has it: Meta+B on a Mac, Control+B elsewhere.
export const modKeyName = (key: string) => (MAC ? `Meta+${key}` : `Control+${key}`);

// A key as written here (modKey()'s, or a key's own name), in words for a screen reader, which
// may read ⌘ as a sign: Command B, Control B, Enter, Slash.
const WORDS: Record<string, string> = {
  '⌘': 'Command',
  '⌥': 'Option',
  '⇧': 'Shift',
  '⌃': 'Control',
  Ctrl: 'Control',
  '/': 'Slash',
};
const SIGNS = /^[⌘⌥⇧⌃]*/u;
export const spokenKeys = (keys: string) =>
  keys
    .split('+')
    // Each sign before a key is a key of its own: ⌘B is ⌘ and B.
    .flatMap((part) => [...(SIGNS.exec(part)?.[0] ?? ''), part.replace(SIGNS, '')])
    .filter(Boolean)
    .map((part) => WORDS[part] ?? part)
    .join(' ');

// Whether a key event has the command key, and not the other one of the two: ⌘ on a Mac (and not
// Ctrl, which is the Mac's own Ctrl+B), Ctrl elsewhere.
export const modPressed = (event: { metaKey: boolean; ctrlKey: boolean }) =>
  MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;

// Whether a key event is for a shortcut's letter (`letter`, in lower case): the letter typed, on a
// layout of Latin letters (AZERTY's Z too, which sits where QWERTY's W does); and where what's
// typed is a letter of another script (a Cyrillic or Greek layout), the key where the letter is
// on QWERTY, as a shortcut goes by on those. Not where it's no letter: Dvorak's ; is where QWERTY
// has Z.
export function pressedLetter(event: { key: string; code: string }, letter: string) {
  const key = event.key.toLowerCase();
  if (/^[a-z]$/.test(key)) return key === letter;
  return /^\p{L}$/u.test(key) && event.code === `Key${letter.toUpperCase()}`;
}

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'pointer-events-none inline-flex h-[18px] min-w-[18px] flex-none items-center justify-center rounded-[5px] border border-border px-1 font-mono text-micro text-t40',
        className,
      )}
      {...props}
    />
  );
}
