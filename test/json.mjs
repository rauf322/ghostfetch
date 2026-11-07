// JSON in the body editor, without a browser. The JSON check: checkJson (src/shared/lib/json.ts),
// which the editor marks mistakes with, agrees with JSON.parse on what's valid, for mistakes
// picked by hand and for thousands of valid bodies broken at random, and says where each mistake
// is and what it is. The pieces chunks() cuts a long body into, which the editor colours one
// by one, and cuts again only where an edit changed it (rechunk()): they make up the body and
// colour exactly as the whole of it does. Format (formatJson()): laid out as JSON.stringify lays
// a body out, changing only its blanks. And where Format puts the cursor (keepOffset()): on the
// character it was on.
//
//   node test/json.mjs      (npm test runs it first)
import { checkJson, formatJson } from '../src/shared/lib/index.ts';
import {
  chunks,
  rechunk,
  tokens,
} from '../src/shared/ui/code-editor/engine/highlight.ts';
import { keepOffset } from '../src/shared/ui/code-editor/engine/keep-offset.ts';
import { check, expect, finish } from './fixtures.mjs';

const parses = (text) => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

// [text, message, the characters marked, line, column]
const MISTAKES = [
  ['{\n  "id": 42\n  "name": "Ada"\n}', 'Missing comma after 42', '42', 2, 9],
  ['{"a": {"b": 1} "c": 2}', 'Missing comma after the object', '}', 1, 14],
  ['["a" "b"]', 'Missing comma after "a"', '"a"', 1, 2],
  ['{"a": 1,}', 'Trailing comma: JSON allows none before }', ',', 1, 8],
  ['[1, 2,\n]', 'Trailing comma: JSON allows none before ]', ',', 1, 6],
  ["{'a': 1}", 'Property names take double quotes, not single ones', "'a'", 1, 2],
  ['{a: 1}', 'Property names need double quotes: "a"', 'a', 1, 2],
  ['{"a": \'b\'}', 'Strings take double quotes, not single ones', "'b'", 1, 7],
  ['{“a”: 1}', 'Curly quotes: use straight double quotes (")', '“a”', 1, 2],
  ['{"a" 1}', 'Missing colon after "a"', '"a"', 1, 2],
  ['{"a": }', 'Missing value after "a":', ':', 1, 5],
  ['{"ui": ', 'Missing value after "ui":', ':', 1, 6],
  ['{"a": "b}', 'This string is never closed: add a " at its end', '"b}', 1, 7],
  [
    '{"a": "b\n}',
    'This string is never closed: add a " before the end of the line',
    '"b',
    1,
    7,
  ],
  ['{"a": tru}', "tru isn't a JSON value: did you mean true?", 'tru', 1, 7],
  ['{"a": True}', 'Write true in lowercase', 'True', 1, 7],
  [
    '{"a": undefined}',
    'JSON has no undefined: use null, or leave the property out',
    'undefined',
    1,
    7,
  ],
  ['{"a": NaN}', 'JSON has no NaN: use null or a string', 'NaN', 1, 7],
  [
    '{"a": hello}',
    'hello isn\'t a JSON value: a string needs double quotes ("hello")',
    'hello',
    1,
    7,
  ],
  ['{"a": 01}', "Numbers can't start with 0: write 1", '01', 1, 7],
  ['{"a": 1.}', 'A decimal point needs a digit after it', '1.', 1, 7],
  ['{"a": .5}', 'A number needs a digit before its decimal point: 0.5', '.5', 1, 7],
  ['{"a": +1}', "Numbers can't start with +", '+1', 1, 7],
  ['{"a": 1e}', 'An exponent needs digits, like 1e5', '1e', 1, 7],
  ['{"a": 0x1F}', 'Numbers in JSON are decimal: no 0x', '0x1F', 1, 7],
  [
    '{"a": 12px}',
    '12px isn\'t a number: a string needs double quotes ("12px")',
    '12px',
    1,
    7,
  ],
  ['{"a": [1, 2}', 'Expected ] to close the [ on line 1, found }', '}', 1, 12],
  ['{"a": 1]', 'Expected } to close the { on line 1, found ]', ']', 1, 8],
  ['[1, , 2]', 'Expected a value before this comma', ',', 1, 5],
  [
    '{"a": 1} {"b": 2}',
    'More after the end of the JSON: a body is a single value',
    '{"b": 2}',
    1,
    10,
  ],
  ['{"a": 1}}', 'Extra } after the end of the JSON', '}', 1, 9],
  ['{\n  // a note\n  "a": 1\n}', "JSON doesn't allow comments", '// a note', 2, 3],
  [
    '{"a": "\\x"}',
    "\\x isn't an escape in JSON: write \\\\ for a backslash",
    '\\x',
    1,
    8,
  ],
  ['{"a": "\\u12"}', '\\u needs four hex digits, like \\u00e9', '\\u12', 1, 8],
  ['{"a": "\t"}', 'A tab inside a string must be written \\t', '\t', 1, 8],
  ['{"a": 1', 'This { is never closed: add a }', '{', 1, 1],
  ['[[1, 2]', 'This [ is never closed: add a ]', '[', 1, 1],
  ['{"a": @}', 'Unexpected character @', '@', 1, 7],
  ['﻿{}', 'Unexpected byte order mark', '﻿', 1, 1],
  ['{"a": 1}', 'Unexpected no-break space', ' ', 1, 6],
  ['   ', 'Empty body', '', 1, 1],
];

console.log('mistakes, one by one');
for (const [text, message, marked, line, column] of MISTAKES) {
  await check(`${JSON.stringify(text)}: ${message}`, async () => {
    const problem = checkJson(text);
    if (!problem) throw new Error('not reported');
    expect(
      [
        problem.message,
        text.slice(problem.from, problem.to),
        problem.line,
        problem.column,
      ],
      [message, marked, line, column],
    );
    expect(parses(text), false, 'JSON.parse agrees it is invalid');
  });
}

console.log('valid JSON');
await check('every kind of value, nested, with every escape, passes', async () => {
  const valid = [
    '{}',
    '[]',
    '0',
    '-0',
    '-1.5e+10',
    '1E-3',
    '"plain"',
    'true',
    'null',
    ' \t\r\n{"a" : [ 1 , { "b" : null } ] } \n',
    '"\\" \\\\ \\/ \\b \\f \\n \\r \\t \\u00e9 \\uD83D\\uDE00 😀 \u007f"',
    '{"": "", "a": {"a": {"a": []}}, "dup": 1, "dup": 2}',
    JSON.stringify(
      { users: [{ id: 1, name: 'Ada', tags: ['x'], active: true, score: 9.5 }] },
      null,
      2,
    ),
  ];
  for (const text of valid) expect(checkJson(text), null, JSON.stringify(text));
});
await check(
  'nested deeper than the stack goes still agrees with JSON.parse',
  async () => {
    const deep = `${'['.repeat(100_000)}${']'.repeat(100_000)}`;
    expect(checkJson(deep) === null, parses(deep));
  },
);

// Random valid bodies, broken at random: a seeded generator, so a failure always reproduces.
function generator(seed) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n) => Math.floor(next() * n);
  const pick = (list) => list[int(list.length)];
  const value = (depth) => {
    const kind = depth > 3 ? int(4) : int(6);
    if (kind === 0) return pick([0, -1, 42, 3.14, -2.5e-7, 1e21, 1234567]);
    if (kind === 1)
      return pick(['', 'Ada', 'é', 'line\nbreak', 'quote"d', 'back\\slash', '😀', '\t']);
    if (kind === 2) return pick([true, false, null]);
    if (kind === 3) return pick(['x', 'y z', '{"not": "nested"}']);
    if (kind === 4) return Array.from({ length: int(4) }, () => value(depth + 1));
    return Object.fromEntries(
      Array.from({ length: int(4) }, () => [
        pick(['id', 'name', 'a b', '', 'é']),
        value(depth + 1),
      ]),
    );
  };
  const CHARS = [
    '{',
    '}',
    '[',
    ']',
    ',',
    ':',
    '"',
    "'",
    '\\',
    ' ',
    '\n',
    '\t',
    '0',
    '7',
    '.',
    '-',
    '+',
    'e',
    'E',
    'x',
    't',
    'n',
    'u',
    '/',
    '*',
    '“',
    ' ',
    '\u0001',
  ];
  const mutate = (text) => {
    const at = int(text.length + 1);
    const how = int(4);
    if (how === 0) return text.slice(0, at) + text.slice(at + 1);
    if (how === 1) return text.slice(0, at) + pick(CHARS) + text.slice(at);
    if (how === 2) return text.slice(0, at) + pick(CHARS) + text.slice(at + 1);
    const length = 1 + int(4);
    return text.slice(0, at) + text.slice(at, at + length) + text.slice(at);
  };
  return { int, value, mutate };
}

// Bodies written by hand: blanks of their own around the tokens, and tokens spelled as
// JSON.stringify wouldn't spell them (escapes, 1.0, a number too long for a double, a key given
// twice, keys like "10" that JSON.parse puts first), which Format has to keep as they are.
function handWriter(random) {
  const pick = (list) => list[random.int(list.length)];
  const blanks = () => pick(['', '', ' ', '  ', '\n', '\n    ', '\t', ' \n', '\r\n']);
  const NUMBERS = ['0', '-0', '42', '1.0', '1.50', '2.5E-7', '1e5', '1E+2', '-0.000'];
  const LONG = ['12345678901234567890', '0.1000000000000000055511151231257827'];
  const STRINGS = [
    '""',
    '"Ada"',
    '"y z"',
    '"https:\\/\\/a.example\\/b"',
    '"\\u00e9t\\u00e9"',
    '"\\ud83d\\ude00"',
    '"say \\"hi\\""',
    '"back\\\\slash"',
    '"\\b\\f\\n\\r\\t"',
    '"é"',
    '"{\\"not\\": \\"nested\\"}"',
  ];
  const KEYS = ['"id"', '"10"', '"2"', '"a b"', '""', '"\\u0069d"', '"é"'];
  const list = (open, close, items) =>
    `${open}${blanks()}${items.join(`${blanks()},${blanks()}`)}${blanks()}${close}`;
  const value = (depth) => {
    const kind = depth > 3 ? random.int(3) : random.int(5);
    if (kind === 0) return pick(random.int(4) ? NUMBERS : LONG);
    if (kind === 1) return pick(STRINGS);
    if (kind === 2) return pick(['true', 'false', 'null']);
    const length = random.int(4);
    if (kind === 3)
      return list(
        '[',
        ']',
        Array.from({ length }, () => value(depth + 1)),
      );
    // Picked at random, a key is often given twice.
    const members = Array.from(
      { length },
      () => `${pick(KEYS)}${blanks()}:${blanks()}${value(depth + 1)}`,
    );
    return list('{', '}', members);
  };
  // A body: a list of up to six values, with blanks around it.
  const body = () =>
    `${blanks()}${list(
      '[',
      ']',
      Array.from({ length: 1 + random.int(6) }, () => value(1)),
    )}${blanks()}`;
  return { body };
}
const strip = (text) => text.replace(/[ \n\t\r]/g, '');

console.log('valid bodies broken at random');
await check(
  'checkJson and JSON.parse agree on 30,000 bodies, and every mistake has a place',
  async () => {
    const random = generator(20261031);
    const disagreements = [];
    let invalid = 0;
    for (let round = 0; round < 30_000; round++) {
      let text = JSON.stringify(random.value(0), null, [0, 2, '\t'][random.int(3)]);
      for (let times = random.int(3); times > 0; times--) text = random.mutate(text);
      const problem = checkJson(text);
      const valid = parses(text);
      if (!valid) invalid++;
      if ((problem === null) !== valid) disagreements.push(text);
      else if (problem && text.trim()) {
        const before = text.slice(0, problem.from);
        const placed =
          problem.from >= 0 &&
          problem.from < problem.to &&
          problem.to <= text.length &&
          problem.line === before.split('\n').length &&
          problem.column === problem.from - before.lastIndexOf('\n') &&
          problem.message &&
          problem.note;
        if (!placed) disagreements.push(`(misplaced) ${text}`);
      }
    }
    if (disagreements.length)
      throw new Error(
        `${disagreements.length} disagreements, e.g.\n${disagreements
          .slice(0, 5)
          .map((text) => JSON.stringify(text))
          .join('\n')}`,
      );
    // The random breaks have to produce plenty of invalid bodies, or this proves little.
    if (invalid < 10_000) throw new Error(`only ${invalid} invalid bodies`);
  },
);

console.log('a long body highlighted in pieces');
await check(
  'the pieces join back into the body and colour exactly as the whole body does',
  async () => {
    const random = generator(20261101);
    // The text as coloured, written out: each token in brackets with its colour, the plain text
    // between them as it is. The pieces' join must read the same as the whole text's.
    const coloured = (text) =>
      tokens(text)
        .map(([kind, part]) => (kind ? `[${kind}:${part}]` : part))
        .join('');
    const wrong = [];
    let cut = 0;
    for (let round = 0; round < 20_000 && wrong.length < 5; round++) {
      let text = JSON.stringify(random.value(0), null, [0, 2][random.int(2)]);
      for (let times = random.int(3); times > 0; times--) text = random.mutate(text);
      // Now and then a key with its colon on the next line, which a cut mustn't come between.
      if (random.int(10) === 0) text = text.replace('":', '"\n  :');
      // Small pieces, so that bodies of a few hundred characters are cut many times.
      const pieces = chunks(text, 1 + random.int(40));
      if (pieces.length > 1) cut++;
      if (
        pieces.join('') !== text ||
        (pieces.length > 1 && pieces.some((piece) => !piece)) ||
        pieces.map((piece) => coloured(piece)).join('') !== coloured(text)
      )
        wrong.push(text);
    }
    if (wrong.length)
      throw new Error(
        `cut wrong:\n${wrong.map((text) => JSON.stringify(text)).join('\n')}`,
      );
    // Many bodies are shorter than their piece size; enough of them have to be cut.
    if (cut < 2000) throw new Error(`only ${cut} bodies were cut into pieces`);
  },
);
await check(
  'after edits, the pieces cut again only where the text changed still join back into it and colour exactly as the whole of it does',
  async () => {
    const random = generator(20261103);
    const coloured = (text) =>
      tokens(text)
        .map(([kind, part]) => (kind ? `[${kind}:${part}]` : part))
        .join('');
    const wrong = [];
    let kept = 0;
    let before = 0;
    for (let round = 0; round < 10_000 && wrong.length < 5; round++) {
      // A longer body than above: a list of values, so there are pieces to keep.
      const indent = [0, 2][random.int(2)];
      const values = Array.from({ length: 3 + random.int(28) }, () => random.value(1));
      let text = JSON.stringify(values, null, indent);
      if (random.int(10) === 0) text = text.replace('":', '"\n  :');
      const size = 1 + random.int(80);
      let pieces = chunks(text, size);
      // A few edits in a row, as typing makes them: each cuts again from the pieces the last
      // one left.
      for (let times = 1 + random.int(4); times > 0 && !wrong.length; times--) {
        const edited = random.mutate(text);
        const { first, last, fresh } = rechunk(pieces, edited, size);
        const next = [...pieces.slice(0, first), ...fresh, ...pieces.slice(last + 1)];
        // How many pieces stay where they hold whole lines, as the editor's do (a line longer
        // than a piece is always cut again whole).
        if (indent && size >= 40) {
          before += pieces.length;
          kept += pieces.length - (last - first + 1);
        }
        if (
          next.join('') !== edited ||
          next.some((piece) => !piece) ||
          next.map((piece) => coloured(piece)).join('') !== coloured(edited)
        )
          wrong.push(`${JSON.stringify(text)} edited to ${JSON.stringify(edited)}`);
        text = edited;
        pieces = next;
      }
    }
    if (wrong.length) throw new Error(`cut wrong:\n${wrong.join('\n')}`);
    // An edit changes one place; in a body of many lines, most of the pieces have to be kept,
    // or this proves little.
    if (kept < before / 2) throw new Error(`kept only ${kept} pieces of ${before}`);
  },
);

console.log('Format changes only the blanks');
await check(
  'lays out 30,000 random bodies, written with any indent, as JSON.stringify(value, null, 2) does',
  async () => {
    const random = generator(20261108);
    const wrong = [];
    for (let round = 0; round < 30_000 && wrong.length < 5; round++) {
      const value = random.value(0);
      const text = JSON.stringify(value, null, [0, 2, 4, '\t', ' '][random.int(5)]);
      if (formatJson(text) !== JSON.stringify(value, null, 2)) wrong.push(text);
    }
    if (wrong.length) throw new Error(`laid out differently:\n${wrong.join('\n')}`);
  },
);
await check(
  'keeps each token as written: escapes, 1.0, a number too long for a double, a key given twice, the order of keys like "10"',
  async () => {
    const cases = [
      [
        '{"url":"https:\\/\\/x.example\\/a"}',
        '{\n  "url": "https:\\/\\/x.example\\/a"\n}',
      ],
      ['{"name":"\\u00e9t\\u00e9"}', '{\n  "name": "\\u00e9t\\u00e9"\n}'],
      ['[1.0, 1.50, 1e5, -0]', '[\n  1.0,\n  1.50,\n  1e5,\n  -0\n]'],
      ['{"id":12345678901234567890}', '{\n  "id": 12345678901234567890\n}'],
      ['{"a":1,"a":2}', '{\n  "a": 1,\n  "a": 2\n}'],
      ['{"b":1,"10":2,"2":3}', '{\n  "b": 1,\n  "10": 2,\n  "2": 3\n}'],
      ['{"q":"say \\"hi\\" \\\\"}', '{\n  "q": "say \\"hi\\" \\\\"\n}'],
      ['[ { } , [\n] , { "a" : [ ] } ]', '[\n  {},\n  [],\n  {\n    "a": []\n  }\n]'],
      ['\r\n  "just a string"\t', '"just a string"'],
    ];
    expect(
      cases.map(([text]) => formatJson(text)),
      cases.map(([, expected]) => expected),
    );
    expect(['', '{"a":}', '[1,]', "{'a': 1}", '{"a": 1} {"b": 2}'].map(formatJson), [
      null,
      null,
      null,
      null,
      null,
    ]);
  },
);
await check(
  'on 5,000 bodies written by hand, changes nothing but the blanks, stays valid, and formats again to itself',
  async () => {
    const hand = handWriter(generator(20261109));
    const wrong = [];
    for (let round = 0; round < 5000 && wrong.length < 5; round++) {
      const text = hand.body();
      const formatted = formatJson(text);
      const same =
        formatted !== null &&
        strip(formatted) === strip(text) &&
        formatJson(formatted) === formatted &&
        JSON.stringify(JSON.parse(formatted)) === JSON.stringify(JSON.parse(text));
      if (!same) wrong.push(`${JSON.stringify(text)} → ${JSON.stringify(formatted)}`);
    }
    if (wrong.length) throw new Error(`changed:\n${wrong.join('\n')}`);
  },
);

console.log('Format keeps the cursor on its character');
// The body formatted, with the place where keepOffset() moves it: in and out marked with a |.
const formatted = (marked, side) => {
  const before = marked.replace('|', '');
  const after = formatJson(before);
  const at = keepOffset(before, after, marked.indexOf('|'), side);
  return `${after.slice(0, at)}|${after.slice(at)}`;
};
await check(
  'in a word, a string, an indent, after a colon, at the end of a line, at either end, past escapes and a 1.0, and between two characters Format parts: a start with the one after it, an end with the one before',
  async () => {
    const cases = [
      [
        '{"name":"item 4|0","tags":["a"]}',
        '{\n  "name": "item 4|0",\n  "tags": [\n    "a"\n  ]\n}',
      ],
      [
        '{"url":"https:\\/\\/a.example","price":1.0,"name":"it|em"}',
        '{\n  "url": "https:\\/\\/a.example",\n  "price": 1.0,\n  "name": "it|em"\n}',
      ],
      ['{"name":"Ada| Lovelace"}', '{\n  "name": "Ada| Lovelace"\n}'],
      ['{"a":1,\n|    "b":2}', '{\n  "a": 1,\n|  "b": 2\n}'],
      ['{"a":1,\n    |"b":2}', '{\n  "a": 1,\n  |"b": 2\n}'],
      ['{"a":| 1}', '{\n  "a":| 1\n}'],
      ['{"a":1,|\n"b":2}', '{\n  "a": 1,|\n  "b": 2\n}'],
      ['|{"a":1}', '|{\n  "a": 1\n}'],
      ['{"a":1}|', '{\n  "a": 1\n}|'],
      ['{"a":25|}', '{\n  "a": 25\n|}', 'start'],
      ['{"a":25|}', '{\n  "a": 25|\n}', 'end'],
      ['{|"a":1}', '{\n  |"a": 1\n}', 'start'],
      ['{|"a":1}', '{|\n  "a": 1\n}', 'end'],
      ['{"a": |1}', '{\n  "a": |1\n}', 'end'],
    ];
    expect(
      cases.map(([marked, , side]) => formatted(marked, side)),
      cases.map(([, expected]) => expected),
    );
  },
);
await check(
  'every place in 2,000 bodies written by hand keeps the text before it, and stays ahead of the character it was ahead of on its line (an end right after a character, after that one), or else right after the one it was after',
  async () => {
    const hand = handWriter(generator(20261107));
    const wrong = [];
    let places = 0;
    for (let round = 0; round < 2000 && wrong.length < 5; round++) {
      const before = hand.body();
      const after = formatJson(before);
      for (let offset = 0; offset <= before.length; offset++) {
        for (const side of ['start', 'end']) {
          places++;
          const moved = keepOffset(before, after, offset, side);
          const rest = before.slice(offset);
          // The blanks ahead of the place on its line, and the character after them.
          const gap = /^[ \t\r]*/.exec(rest)[0].length;
          const next = rest[gap];
          const ahead = next !== undefined && next !== '\n';
          const skipped = /^[ \t\r]*/.exec(after.slice(moved))[0].length;
          const previous = offset ? before[offset - 1] : undefined;
          const placed =
            side === 'end' && previous && /[^ \n\t\r]/.test(previous)
              ? after[moved - 1] === previous
              : ahead
                ? after[moved + skipped] === next && skipped <= gap
                : moved === 0 || /[^ \n\t\r]/.test(after[moved - 1]);
          if (strip(before.slice(0, offset)) !== strip(after.slice(0, moved)) || !placed)
            wrong.push(`${JSON.stringify(before)} at ${offset} (${side}): ${moved}`);
        }
      }
    }
    if (wrong.length) throw new Error(`placed wrong:\n${wrong.join('\n')}`);
    if (places < 100_000) throw new Error(`only ${places} places`);
  },
);

finish();
