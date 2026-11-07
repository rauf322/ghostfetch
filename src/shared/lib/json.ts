// JSON text: pretty-printed, or the first mistake in it, where it is and what's wrong.

// JSON's blanks, which are all that may stand between its tokens.
const isBlank = (char: string | undefined) =>
  char === ' ' || char === '\n' || char === '\t' || char === '\r';

// Whether the character at `at` is escaped: an odd number of backslashes before it.
function escaped(text: string, at: number) {
  let backslashes = 0;
  while (text[at - 1 - backslashes] === '\\') backslashes++;
  return backslashes % 2 === 1;
}

// Pretty-prints JSON text, two spaces an indent, laid out as JSON.stringify(value, null, 2) lays
// it out, but by changing only the blanks between the tokens: each token stays as it's written,
// where JSON.parse and JSON.stringify would write it their own way ("\/" and "\u00e9" as / and é,
// 1.0 as 1, a number too long for a double rounded, a key given twice only once, keys like "10"
// and "2" moved to the front). So Format, a mock made from a response and a response shown in
// Traffic never change what a body says, and a place in a body can be found again after it's
// formatted (the body editor's keepOffset()). Returns null if it isn't valid JSON.
export function formatJson(text: string) {
  try {
    JSON.parse(text);
  } catch {
    return null;
  }
  const parts: string[] = [];
  // A line break and the indent for each depth, made once.
  const breaks: string[] = [];
  const indent = (depth: number) => (breaks[depth] ??= `\n${'  '.repeat(depth)}`);
  let depth = 0;
  for (let at = 0; at < text.length;) {
    const char = text[at]!;
    if (isBlank(char)) {
      at++;
    } else if (char === '"') {
      let end = text.indexOf('"', at + 1);
      while (escaped(text, end)) end = text.indexOf('"', end + 1);
      parts.push(text.slice(at, end + 1));
      at = end + 1;
    } else if (char === '{' || char === '[') {
      let next = at + 1;
      while (isBlank(text[next])) next++;
      // An empty one stays on its line, as {} or [].
      if (text[next] === '}' || text[next] === ']') {
        parts.push(char, text[next]!);
        at = next + 1;
      } else {
        parts.push(char, indent(++depth));
        at++;
      }
    } else if (char === '}' || char === ']') {
      parts.push(indent(--depth), char);
      at++;
    } else if (char === ',') {
      parts.push(',', indent(depth));
      at++;
    } else if (char === ':') {
      parts.push(': ');
      at++;
    } else {
      // A number, true, false or null: up to the blank or the punctuation after it.
      let end = at + 1;
      while (end < text.length && !isBlank(text[end]) && !',:]}'.includes(text[end]!))
        end++;
      parts.push(text.slice(at, end));
      at = end;
    }
  }
  return parts.join('');
}

// The first mistake in some JSON text: the characters to mark (from, up to but not including
// to), where they start (line and column, counted from 1), what's wrong (message), and the same in
// a few words for the end of the line (note).
export interface JsonProblem {
  from: number;
  to: number;
  line: number;
  column: number;
  message: string;
  note: string;
}

// A value checkJson has read: where it starts and ends, and what it is.
interface Read {
  from: number;
  to: number;
  kind: 'object' | 'array' | 'string' | 'number' | 'literal';
}

class Mistake {
  from: number;
  to: number;
  message: string;
  note: string;
  constructor(from: number, to: number, message: string, note: string) {
    this.from = from;
    this.to = to;
    this.message = message;
    this.note = note;
  }
}

// A number as JSON writes it, and the run of characters a number-like word takes up: anything in
// it past the number makes the text invalid, as none of those characters may follow a number.
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const NUMBER_RUN = /[-+.\w]+/y;
const WORD = /[A-Za-z_$][\w$]*/y;
const NAME = /[\w$]+/y;
const CURLY_QUOTES = '“”„‘’‚';
const LITERALS = ['true', 'false', 'null'];

// Finds the first thing that keeps the text from being JSON, and says where it is and what's
// wrong in words a person can act on; null for valid JSON. It reads the text by JSON's grammar
// (RFC 8259), as JSON.parse does, so the two always agree on what's valid (test/json.mjs checks
// that). Unlike JSON.parse's errors, which differ between Chrome and Firefox and often have no
// position, it reads the same in every browser.
export function checkJson(text: string): JsonProblem | null {
  if (!text.trim()) return problem(text, new Mistake(0, 0, 'Empty body', ''));
  let at = 0;

  const fail = (from: number, to: number, message: string, note: string): never => {
    throw new Mistake(from, Math.max(to, from + 1), message, note);
  };
  const lineEnd = (from: number) => {
    const end = text.indexOf('\n', from);
    return end === -1 ? text.length : end;
  };
  const lineOf = (index: number) => text.slice(0, index).split('\n').length;
  const match = (pattern: RegExp, from: number) => {
    pattern.lastIndex = from;
    return pattern.exec(text)?.[0] ?? '';
  };
  // Up to the closing quote (any of `closers`) on the same line, or the end of the line.
  const quoted = (from: number, closers: string) => {
    for (let index = from + 1, end = lineEnd(from); index < end; index++)
      if (closers.includes(text[index]!)) return index + 1;
    return lineEnd(from);
  };
  const width = (index: number) => (text.codePointAt(index)! > 0xffff ? 2 : 1);

  function skipSpace() {
    while (at < text.length) {
      const char = text[at];
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') at++;
      else if (char === '/' && (text[at + 1] === '/' || text[at + 1] === '*')) {
        const close = text.indexOf('*/', at + 2);
        const end =
          text[at + 1] === '/' ? lineEnd(at) : close === -1 ? text.length : close + 2;
        fail(at, end, "JSON doesn't allow comments", 'no comments in JSON');
      } else return;
    }
  }

  function value(): Read {
    const char = text[at]!;
    if (char === '{') return object();
    if (char === '[') return array();
    if (char === '"') return string();
    if (char === '-' || (char >= '0' && char <= '9')) return number();
    const word = match(WORD, at);
    if (word) return literal(word);
    if (char === "'")
      fail(at, quoted(at, "'"), 'Strings take double quotes, not single ones', 'use "');
    if (CURLY_QUOTES.includes(char))
      fail(
        at,
        quoted(at, `${CURLY_QUOTES}"`),
        'Curly quotes: use straight double quotes (")',
        'use "',
      );
    if (char === '+' || char === '.') {
      const run = match(NUMBER_RUN, at);
      fail(
        at,
        at + run.length,
        char === '+'
          ? "Numbers can't start with +"
          : `A number needs a digit before its decimal point: 0${run}`,
        'bad number',
      );
    }
    if (char === ',')
      fail(at, at + 1, 'Expected a value before this comma', 'value expected');
    if (char === '}' || char === ']')
      fail(at, at + 1, `Expected a value, found ${char}`, 'value expected');
    return fail(at, at + width(at), `Unexpected ${describe(char)}`, 'not JSON');
  }

  function object(): Read {
    const open = at++;
    skipSpace();
    if (text[at] === '}') return { from: open, to: ++at, kind: 'object' };
    let comma = -1;
    for (;;) {
      if (at >= text.length) unclosed(open);
      if (text[at] === '}' && comma >= 0)
        fail(
          comma,
          comma + 1,
          'Trailing comma: JSON allows none before }',
          'trailing comma',
        );
      const name = key();
      skipSpace();
      if (text[at] !== ':') {
        if (at >= text.length) unclosed(open);
        fail(name.from, name.to, `Missing colon after ${show(name)}`, 'missing colon');
      }
      const colon = at++;
      skipSpace();
      if (at >= text.length || text[at] === ',' || text[at] === '}')
        fail(colon, colon + 1, `Missing value after ${show(name)}:`, 'value expected');
      const item = value();
      skipSpace();
      if (text[at] === ',') {
        comma = at++;
        skipSpace();
      } else if (text[at] === '}') return { from: open, to: ++at, kind: 'object' };
      else after(item, open, '}');
    }
  }

  function key(): Read {
    const char = text[at]!;
    if (char === '"') return string();
    const name = match(NAME, at);
    if (name)
      fail(
        at,
        at + name.length,
        `Property names need double quotes: "${name}"`,
        'quote the name',
      );
    if (char === "'")
      fail(
        at,
        quoted(at, "'"),
        'Property names take double quotes, not single ones',
        'use "',
      );
    if (CURLY_QUOTES.includes(char))
      fail(
        at,
        quoted(at, `${CURLY_QUOTES}"`),
        'Curly quotes: use straight double quotes (")',
        'use "',
      );
    if (char === ',')
      fail(at, at + 1, 'Expected a property name before this comma', 'name expected');
    return fail(
      at,
      at + width(at),
      `Expected a property name in double quotes, found ${describe(char)}`,
      'name expected',
    );
  }

  function array(): Read {
    const open = at++;
    skipSpace();
    if (text[at] === ']') return { from: open, to: ++at, kind: 'array' };
    let comma = -1;
    for (;;) {
      if (at >= text.length) unclosed(open);
      if (text[at] === ']' && comma >= 0)
        fail(
          comma,
          comma + 1,
          'Trailing comma: JSON allows none before ]',
          'trailing comma',
        );
      const item = value();
      skipSpace();
      if (text[at] === ',') {
        comma = at++;
        skipSpace();
      } else if (text[at] === ']') return { from: open, to: ++at, kind: 'array' };
      else after(item, open, ']');
    }
  }

  // What follows a value in an object or a list, when it isn't a comma or the closing bracket.
  function after(item: Read, open: number, close: '}' | ']'): never {
    if (at >= text.length) unclosed(open);
    const char = text[at]!;
    if (char === '}' || char === ']')
      fail(
        at,
        at + 1,
        `Expected ${close} to close the ${text[open]} on line ${lineOf(open)}, found ${char}`,
        'wrong bracket',
      );
    if (char === ':')
      fail(
        at,
        at + 1,
        close === ']'
          ? 'A list holds values, not "name": value pairs (those go in { })'
          : `Unexpected colon after ${show(item)}`,
        'unexpected :',
      );
    if (startsValue(char)) {
      // An object or a list is marked at its closing bracket, anything else as a whole.
      const container = item.kind === 'object' || item.kind === 'array';
      fail(
        container ? item.to - 1 : item.from,
        item.to,
        `Missing comma after ${show(item)}`,
        'missing comma',
      );
    }
    return fail(
      at,
      at + width(at),
      `Expected , or ${close} after ${show(item)}, found ${describe(char)}`,
      'unexpected',
    );
  }

  function unclosed(open: number): never {
    const close = text[open] === '{' ? '}' : ']';
    return fail(
      open,
      open + 1,
      `This ${text[open]} is never closed: add a ${close}`,
      'never closed',
    );
  }

  function string(): Read {
    const from = at++;
    while (at < text.length) {
      const char = text[at]!;
      if (char === '"') return { from, to: ++at, kind: 'string' };
      if (char === '\\') escape();
      else if (char === '\n' || char === '\r')
        fail(
          from,
          at,
          'This string is never closed: add a " before the end of the line',
          'unclosed string',
        );
      else if (char < ' ')
        fail(
          at,
          at + 1,
          char === '\t'
            ? 'A tab inside a string must be written \\t'
            : `A ${describe(char)} must be escaped inside a string`,
          'escape it',
        );
      else at++;
    }
    return fail(
      from,
      at,
      'This string is never closed: add a " at its end',
      'unclosed string',
    );
  }

  function escape() {
    const from = at;
    const char = text[at + 1];
    if (char !== undefined && '"\\/bfnrt'.includes(char)) {
      at += 2;
      return;
    }
    if (char === 'u') {
      const digits = /^[0-9a-fA-F]{0,4}/.exec(text.slice(at + 2, at + 6))![0];
      if (digits.length === 4) {
        at += 6;
        return;
      }
      fail(
        from,
        at + 2 + digits.length,
        '\\u needs four hex digits, like \\u00e9',
        'bad escape',
      );
    }
    if (char === undefined || char === '\n' || char === '\r')
      fail(
        from,
        from + 1,
        'A backslash on its own: write \\\\ for a backslash',
        'bad escape',
      );
    fail(
      from,
      from + 1 + width(from + 1),
      `\\${char} isn't an escape in JSON: write \\\\ for a backslash`,
      'bad escape',
    );
  }

  function number(): Read {
    const from = at;
    const run = match(NUMBER_RUN, from);
    if (match(NUMBER, from).length === run.length) {
      at = from + run.length;
      return { from, to: at, kind: 'number' };
    }
    let message = `${run} isn't a number`;
    if (/^-?Infinity$/.test(run)) message = 'JSON has no Infinity: use null or a string';
    else if (/^-?0[xX]/.test(run)) message = 'Numbers in JSON are decimal: no 0x';
    else if (/^-?0\d/.test(run))
      message = `Numbers can't start with 0: write ${run.replace(/^(-?)0+(?=\d)/, '$1')}`;
    else if (/\.(?!\d)/.test(run)) message = 'A decimal point needs a digit after it';
    else if (/^-?\d+(\.\d+)?[eE][+-]?$/.test(run))
      message = 'An exponent needs digits, like 1e5';
    else if (run === '-') message = 'A minus sign needs a number after it';
    else if (/[A-Za-z_]/.test(run))
      message = `${run} isn't a number: a string needs double quotes ("${run}")`;
    return fail(from, from + run.length, message, 'bad number');
  }

  function literal(word: string): Read {
    const from = at;
    const to = at + word.length;
    if (LITERALS.includes(word)) {
      at = to;
      return { from, to, kind: 'literal' };
    }
    const lower = word.toLowerCase();
    if (LITERALS.includes(lower))
      fail(from, to, `Write ${lower} in lowercase`, 'lowercase');
    if (word === 'undefined')
      fail(
        from,
        to,
        'JSON has no undefined: use null, or leave the property out',
        'not JSON',
      );
    if (word === 'NaN' || word === 'Infinity')
      fail(from, to, `JSON has no ${word}: use null or a string`, 'not JSON');
    const guess = LITERALS.find(
      (known) =>
        lower.length >= 2 && (known.startsWith(lower) || lower.startsWith(known)),
    );
    if (guess)
      fail(from, to, `${word} isn't a JSON value: did you mean ${guess}?`, `${guess}?`);
    return fail(
      from,
      to,
      `${word} isn't a JSON value: a string needs double quotes ("${word}")`,
      'needs quotes',
    );
  }

  // How a message names a value: a short one as it's written, a long string cut short, and an
  // object or a list by what it is.
  function show({ from, to, kind }: Read) {
    if (kind === 'object') return 'the object';
    if (kind === 'array') return 'the list';
    const written = text.slice(from, to);
    return written.length > 24
      ? `${written.slice(0, 20)}…${kind === 'string' ? '"' : ''}`
      : written;
  }

  try {
    skipSpace();
    value();
    skipSpace();
    if (at < text.length) {
      const char = text[at]!;
      if (char === '}' || char === ']')
        fail(at, at + 1, `Extra ${char} after the end of the JSON`, 'extra bracket');
      fail(
        at,
        lineEnd(at),
        'More after the end of the JSON: a body is a single value',
        'extra text',
      );
    }
    return null;
  } catch (error) {
    if (error instanceof Mistake) return problem(text, error);
    // Nested deeper than the call stack goes: JSON.parse decides, and the mistake has no place.
    if (error instanceof RangeError) {
      try {
        JSON.parse(text);
        return null;
      } catch {
        return problem(
          text,
          new Mistake(0, 0, 'Nested too deeply to point at the mistake', ''),
        );
      }
    }
    throw error;
  }
}

function startsValue(char: string) {
  return /["{[\-\d\w$'“”„‘’‚]/.test(char);
}

// A character as a message names it ("Unexpected character @", "found no-break space"), the
// invisible ones by name or code.
function describe(char: string) {
  if (char === ' ') return 'no-break space';
  if (char === '﻿') return 'byte order mark';
  if (char < ' ' || char === '\u007f')
    return `control character U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
  return `character ${char}`;
}

function problem(text: string, { from, to, message, note }: Mistake): JsonProblem {
  const before = text.slice(0, from);
  return {
    from,
    to: Math.min(to, text.length),
    line: before.split('\n').length,
    column: from - before.lastIndexOf('\n'),
    message,
    note,
  };
}
