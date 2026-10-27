// The keys typed in Normal and Visual mode, as commands: keyName() writes a key in vim's
// notation ("w", "<Esc>", "<C-r>"), and parse() reads the keys typed so far as a command ("3dw",
// "ci{", "gg").
import { BLOCKS } from './text-objects.ts';
import type { Command } from './types.ts';

const NAMED_KEYS: Record<string, string> = {
  Escape: '<Esc>',
  Enter: '<CR>',
  Backspace: '<BS>',
  Delete: '<Del>',
  ArrowLeft: '<Left>',
  ArrowRight: '<Right>',
  ArrowUp: '<Up>',
  ArrowDown: '<Down>',
  Home: '<Home>',
  End: '<End>',
  PageUp: '<PageUp>',
  PageDown: '<PageDown>',
};
const CONTROL_KEYS = new Set(['r', 'd', 'u']);

// The key in vim's notation ("w", "G", "<Esc>", "<C-r>"), or null for keys vim leaves to the
// browser: Tab, ⌘ and Alt shortcuts, Ctrl shortcuts it doesn't use, and keys that compose text.
export function keyName(event: KeyboardEvent) {
  const { key } = event;
  if (event.isComposing) return null;
  if (key === 'Escape') return '<Esc>';
  if (event.metaKey) return null;
  if (event.ctrlKey) {
    if (key === '[') return '<Esc>';
    const letter = key.length === 1 ? key.toLowerCase() : '';
    return CONTROL_KEYS.has(letter) ? `<C-${letter}>` : null;
  }
  if (NAMED_KEYS[key]) return NAMED_KEYS[key];
  if (event.altKey && /^[\x20-\x7e]$/.test(key)) return null;
  return [...key].length === 1 ? key : null;
}

export const PENDING = 'pending';
const OPERATORS = new Set(['d', 'c', 'y', '>', '<']);
const OBJECTS = new Set(['w', 'W', '"', "'", '`', 'p', ...Object.keys(BLOCKS)]);
const TAKES_CHARACTER = new Set(['f', 'F', 't', 'T', 'r']);
const MOTION_NAMES = new Set([
  'h',
  'l',
  'j',
  'k',
  '<Left>',
  '<Right>',
  '<Up>',
  '<Down>',
  '<BS>',
  ' ',
  'w',
  'W',
  'b',
  'B',
  'e',
  'E',
  'ge',
  'gE',
  '0',
  '^',
  '$',
  '<Home>',
  '<End>',
  'gg',
  'G',
  '+',
  '-',
  '_',
  '<CR>',
  '{',
  '}',
  '%',
  '|',
  'f',
  'F',
  't',
  'T',
  ';',
  ',',
  'n',
  'N',
  '*',
  '#',
]);
export const SCROLLING = new Set([
  'zz',
  'zt',
  'zb',
  '<C-d>',
  '<C-u>',
  '<PageDown>',
  '<PageUp>',
]);
const ANYWHERE = [...SCROLLING, '/', '?', ':', '<Esc>'];
const NORMAL_ACTIONS = new Set([
  'i',
  'a',
  'I',
  'A',
  'o',
  'O',
  'v',
  'V',
  'x',
  '<Del>',
  'X',
  's',
  'S',
  'r',
  'D',
  'C',
  'Y',
  'J',
  'p',
  'P',
  'u',
  '<C-r>',
  '.',
  '~',
  ...ANYWHERE,
]);
const VISUAL_ACTIONS = new Set([
  'd',
  'x',
  '<Del>',
  'X',
  'D',
  'y',
  'Y',
  'c',
  's',
  'C',
  'S',
  'R',
  '>',
  '<',
  '~',
  'u',
  'U',
  'J',
  'p',
  'P',
  'r',
  'o',
  'O',
  'v',
  'V',
  ...ANYWHERE,
]);
// What "." repeats: everything that changes the text, but not yanks, undo or moves.
export const CHANGES = new Set([
  'd',
  'c',
  '>',
  '<',
  'i',
  'a',
  'I',
  'A',
  'o',
  'O',
  'x',
  '<Del>',
  'X',
  's',
  'S',
  'r',
  'D',
  'C',
  'J',
  'p',
  'P',
  '~',
]);

// Reads a command from the keys typed so far: PENDING while it's incomplete, null when it can't
// be one, else { operator, motion, object, around, lines, action, arg, count, hasCount }.
export function parse(keys: string[], visual: boolean): Command | typeof PENDING | null {
  let at = 0;
  const take = () => (at < keys.length ? keys[at++] : null);
  const readCount = () => {
    let digits = '';
    while (at < keys.length && /^\d$/.test(keys[at]) && (digits || keys[at] !== '0'))
      digits += keys[at++];
    return digits ? Math.min(Number(digits), 99_999) : null;
  };
  const first = readCount();
  const counted = (second: number | null = null) => ({
    count: (first ?? 1) * (second ?? 1),
    hasCount: first !== null || second !== null,
  });
  const readName = () => {
    const key = take();
    if (key !== 'g' && key !== 'z') return key;
    const more = take();
    return more === null ? null : key + more;
  };
  // A character after the command, as in "fx" or "ra".
  const withCharacter = (command: Command) => {
    if (!TAKES_CHARACTER.has(command.motion ?? command.action!)) return command;
    const arg = take();
    if (arg === null) return PENDING;
    return (arg === '<CR>' && command.action === 'r') || [...arg].length === 1
      ? { ...command, arg }
      : null;
  };
  const readObject = (prefix: string, command: Command) => {
    const object = take();
    if (object === null) return PENDING;
    return OBJECTS.has(object) ? { ...command, object, around: prefix === 'a' } : null;
  };

  const name = readName();
  if (name === null) return PENDING;
  // ":" reads a line up to Enter, for ":42" and for the ":w" habit.
  if (name === ':') {
    const line: string[] = [];
    for (let key = take(); key !== '<CR>'; key = take()) {
      if (key === null) return PENDING;
      if (key === '<Esc>') return { action: '<Esc>', ...counted() };
      if (key === '<BS>') line.pop();
      else line.push(key);
    }
    return { action: ':', arg: line.join('').trim(), ...counted() };
  }
  if (!visual && OPERATORS.has(name)) {
    const second = readCount();
    const target = readName();
    if (target === null) return PENDING;
    const command = { operator: name, ...counted(second) };
    if (target === name) return { ...command, lines: true };
    if (target === 'i' || target === 'a') return readObject(target, command);
    if (target === '/' || target === '?') return { ...command, search: target };
    return MOTION_NAMES.has(target)
      ? withCharacter({ ...command, motion: target })
      : null;
  }
  if (visual && (name === 'i' || name === 'a')) return readObject(name, counted());
  if (MOTION_NAMES.has(name)) return withCharacter({ motion: name, ...counted() });
  if ((visual ? VISUAL_ACTIONS : NORMAL_ACTIONS).has(name))
    return withCharacter({ action: name, ...counted() });
  return null;
}
