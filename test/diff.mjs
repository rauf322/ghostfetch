// The body editor's Diff, without a browser: diffLines() and diffWords() (src/shared/lib/diff.ts).
// diffLines, on random pairs of bodies: its lines make up each text again, in order, the lines it
// keeps are alike, a change's removed lines come before its added ones, and it keeps as many lines
// as the two have in common (the longest common run of lines, worked out the slow way). Then the
// body the design shows, bodies too far apart to search, and long ones, in good time. diffWords:
// what it marks in two lines is exactly what they don't share.
import { diffLines, diffWords } from '../src/shared/lib/index.ts';
import { check, expect, finish } from './fixtures.mjs';

// Seeded, so a failure always reproduces.
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
  return { int, pick };
}

// Lines as a JSON body has them, few enough that they repeat, as they do in a body.
const LINES = [
  '{',
  '}',
  '  "id": 1,',
  '  "name": "Ada",',
  '  "tags": [',
  '  ],',
  '    "x"',
  '',
];

// A random body, and another made from it with lines removed, added and changed here and there.
function pair(random, length, edits) {
  const before = Array.from({ length }, () => random.pick(LINES));
  const after = [...before];
  for (let edit = 0; edit < edits; edit++) {
    const at = random.int(after.length + 1);
    const kind = random.int(3);
    if (kind === 0 && after.length) after.splice(Math.min(at, after.length - 1), 1);
    else if (kind === 1) after.splice(at, 0, random.pick(LINES));
    else if (after.length) after[Math.min(at, after.length - 1)] = random.pick(LINES);
  }
  return [before.join('\n'), after.join('\n')];
}

// The two texts the diff's lines make up, after checking that what it keeps is alike and each
// text's lines come in order.
function replay(diff) {
  const before = [];
  const after = [];
  let lastBefore = -1;
  let lastAfter = -1;
  for (const line of diff.lines) {
    if (line.kind !== 'add') {
      if (line.before <= lastBefore)
        throw new Error(`before line ${line.before} out of order`);
      lastBefore = line.before;
      before.push(diff.before[line.before]);
    }
    if (line.kind !== 'del') {
      if (line.after <= lastAfter)
        throw new Error(`after line ${line.after} out of order`);
      lastAfter = line.after;
      after.push(diff.after[line.after]);
    }
    if (line.kind === 'same' && diff.before[line.before] !== diff.after[line.after])
      throw new Error(`kept lines differ: ${line.before} and ${line.after}`);
  }
  return [before.join('\n'), after.join('\n')];
}

// How many lines two texts have in common, in order, at most: the slow way, a table.
function longestCommon(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  let row = new Int32Array(y.length + 1);
  for (let i = x.length - 1; i >= 0; i--) {
    const next = new Int32Array(y.length + 1);
    for (let j = y.length - 1; j >= 0; j--)
      next[j] = x[i] === y[j] ? row[j + 1] + 1 : Math.max(row[j], next[j + 1]);
    row = next;
  }
  return row[0];
}

const kinds = (diff) =>
  diff.lines.map((line) => ({ same: '=', del: '-', add: '+' })[line.kind]).join('');

console.log('diffLines');
await check(
  'on 5,000 random pairs of bodies, its lines make up both texts again, in order, and the lines it keeps are alike',
  async () => {
    const random = generator(20261107);
    const wrong = [];
    for (let round = 0; round < 5000 && wrong.length < 3; round++) {
      const [a, b] = pair(random, 1 + random.int(40), random.int(12));
      try {
        const [before, after] = replay(diffLines(a, b));
        if (before !== a || after !== b)
          wrong.push(`${JSON.stringify(a)} → ${JSON.stringify(b)}`);
      } catch (error) {
        wrong.push(`${error.message}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
      }
    }
    if (wrong.length) throw new Error(wrong.join('\n'));
  },
);
await check(
  'keeps as many lines as the two have in common, and removes and adds no more, on 2,000 random pairs',
  async () => {
    const random = generator(20261108);
    const wrong = [];
    for (let round = 0; round < 2000 && wrong.length < 3; round++) {
      const [a, b] = pair(random, 1 + random.int(30), random.int(15));
      const diff = diffLines(a, b);
      const kept = diff.lines.filter((line) => line.kind === 'same').length;
      const common = longestCommon(a, b);
      const lines = [a.split('\n').length, b.split('\n').length];
      if (
        kept !== common ||
        diff.removed !== lines[0] - common ||
        diff.added !== lines[1] - common
      )
        wrong.push(
          `kept ${kept} of ${common}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`,
        );
    }
    if (wrong.length) throw new Error(wrong.join('\n'));
  },
);
await check("a change's removed lines come before its added ones", async () => {
  const random = generator(20261109);
  for (let round = 0; round < 2000; round++) {
    const [a, b] = pair(random, 1 + random.int(30), random.int(15));
    const order = kinds(diffLines(a, b));
    if (order.includes('+-')) throw new Error(`${order}: ${JSON.stringify([a, b])}`);
  }
});
await check(
  "the body the design shows: the role, the permissions and the plan changed, the trial's end gone: +6 −5",
  async () => {
    const server = JSON.stringify(
      {
        id: 42,
        name: 'Ada Lovelace',
        email: 'ada@acme.dev',
        role: 'member',
        permissions: ['billing'],
        plan: { name: 'Free', seats: 1 },
        trialEndsAt: '2026-12-01',
        verified: true,
        lastLogin: null,
      },
      null,
      2,
    );
    const yours = JSON.stringify(
      {
        id: 42,
        name: 'Ada Lovelace',
        email: 'ada@acme.dev',
        role: 'admin',
        permissions: ['billing', 'users', 'settings'],
        plan: { name: 'Team', seats: 25 },
        verified: true,
        lastLogin: null,
      },
      null,
      2,
    );
    const diff = diffLines(server, yours);
    expect([kinds(diff), diff.added, diff.removed], ['====-+=-+++==--++=-===', 6, 5]);
  },
);
await check(
  'alike texts, empty ones and one empty: kept, kept, and replaced',
  async () => {
    const body = '{\n  "a": 1\n}';
    expect(
      [
        kinds(diffLines(body, body)),
        kinds(diffLines('', '')),
        kinds(diffLines('', body)),
      ],
      ['===', '=', '-+++'],
    );
  },
);
await check(
  'bodies too far apart to search (more than 1,000 lines removed and added) show the rest as removed and added whole, and still make up both texts',
  async () => {
    const a = Array.from({ length: 3000 }, (_, i) => `  "a${i}": ${i},`).join('\n');
    const b = Array.from({ length: 3000 }, (_, i) => `  "b${i}": ${i},`).join('\n');
    const diff = diffLines(`{\n${a}\n}`, `{\n${b}\n}`);
    const [before, after] = replay(diff);
    expect(
      [before === `{\n${a}\n}`, after === `{\n${b}\n}`, diff.removed, diff.added],
      [true, true, 3000, 3000],
    );
  },
);
await check(
  'long bodies in good time: 40 lines changed in 20,000, and two of 10,000 lines with none alike, each under 300 ms',
  async () => {
    const random = generator(20261110);
    const long = Array.from({ length: 20_000 }, (_, i) => `    "item ${i}": ${i},`);
    const changed = [...long];
    for (let edit = 0; edit < 40; edit++)
      changed[random.int(changed.length)] = '    "x": 0,';
    const timed = (a, b) => {
      const started = performance.now();
      const diff = diffLines(a, b);
      return [performance.now() - started, diff];
    };
    const [near, nearDiff] = timed(long.join('\n'), changed.join('\n'));
    const apart = Array.from({ length: 10_000 }, (_, i) => `    "other ${i}": ${i},`);
    const [far] = timed(long.slice(0, 10_000).join('\n'), apart.join('\n'));
    if (near > 300 || far > 300)
      throw new Error(`took ${Math.round(near)} ms and ${Math.round(far)} ms`);
    if (nearDiff.removed > 40 || nearDiff.added > 40)
      throw new Error(`-${nearDiff.removed} +${nearDiff.added} for 40 lines changed`);
  },
);

console.log('diffWords');
await check(
  'marks the value that changed, the comma added, and nothing in lines that share only blanks or are too long',
  async () => {
    expect(
      [
        diffWords('  "role": "member",', '  "role": "admin",'),
        diffWords('    "billing"', '    "billing",'),
        diffWords('    "seats": 1', '    "seats": 25'),
        diffWords('abc', 'xyz'),
        diffWords('  1', '  2'),
        diffWords('a,'.repeat(300), 'b,'.repeat(300)),
      ],
      [
        { before: [[10, 18]], after: [[10, 17]] },
        { before: [], after: [[13, 14]] },
        { before: [[13, 14]], after: [[13, 15]] },
        null,
        null,
        null,
      ],
    );
  },
);
await check(
  'on 5,000 random pairs of lines, what it leaves unmarked in each is the same text',
  async () => {
    const random = generator(20261111);
    const TOKENS = [
      '"a"',
      '"b c"',
      '1',
      '25',
      ' ',
      '  ',
      ':',
      ',',
      '[',
      ']',
      'true',
      'null',
    ];
    const line = () =>
      Array.from({ length: 1 + random.int(12) }, () => random.pick(TOKENS)).join('');
    const unmarked = (text, ranges) => {
      let out = '';
      let at = 0;
      for (const [from, to] of ranges) {
        out += text.slice(at, from);
        at = to;
      }
      return out + text.slice(at);
    };
    const wrong = [];
    for (let round = 0; round < 5000 && wrong.length < 3; round++) {
      const a = line();
      const b = line();
      const words = diffWords(a, b);
      if (words && unmarked(a, words.before) !== unmarked(b, words.after))
        wrong.push(
          `${JSON.stringify(a)} / ${JSON.stringify(b)} → ${JSON.stringify(words)}`,
        );
    }
    if (wrong.length) throw new Error(wrong.join('\n'));
  },
);

finish();
