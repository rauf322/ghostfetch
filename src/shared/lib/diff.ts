// What changed between two texts, for the body editor's Diff: line by line (diffLines), the lines
// that stay, the ones only the first has (removed) and the ones only the second has (added), the
// removed lines of a change before its added ones, as git shows them; and in a line changed into
// another, the parts of each that changed (diffWords). test/diff.mjs checks both.

export type DiffKind = 'same' | 'del' | 'add';

// A line of the diff: what it is, and where it is in each text, as its index there (from 0), or -1
// in the text it isn't in.
export interface DiffLine {
  kind: DiffKind;
  before: number;
  after: number;
}

export interface TextDiff {
  // Each text's lines.
  before: string[];
  after: string[];
  lines: DiffLine[];
  added: number;
  removed: number;
}

// Past this many lines removed and added, the rest of a change shows as removed whole and added
// whole: finding the fewest takes time in proportion to the lines times the changes (Myers'
// algorithm), and two bodies that far apart read as one replaced by the other anyway.
const MAX_CHANGES = 1000;

export function diffLines(before: string, after: string): TextDiff {
  const a = before.split('\n');
  const b = after.split('\n');
  // Each line as a number, the same for the same line, so lines compare as numbers.
  const numbers = new Map<string, number>();
  const number = (line: string) => {
    let value = numbers.get(line);
    if (value === undefined) numbers.set(line, (value = numbers.size));
    return value;
  };
  const x = Int32Array.from(a, number);
  const y = Int32Array.from(b, number);
  // The lines both start and end with stay out of the search.
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let endX = x.length;
  let endY = y.length;
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX--;
    endY--;
  }
  const lines: DiffLine[] = [];
  for (let line = 0; line < start; line++)
    lines.push({ kind: 'same', before: line, after: line });
  grouped(shortestEdit(x, start, endX, y, start, endY), lines);
  for (let i = endX, j = endY; i < x.length; i++, j++)
    lines.push({ kind: 'same', before: i, after: j });
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === 'add') added++;
    else if (line.kind === 'del') removed++;
  }
  return { before: a, after: b, lines, added, removed };
}

// The fewest lines removed and added that turn x[x0, x1) into y[y0, y1), with the lines that stay
// between them: Myers' O(ND) algorithm, which follows each diagonal as far as the two agree, one
// more change at a time, keeping how far each got for the way back. With more than MAX_CHANGES,
// all of the one is removed and all of the other added.
function shortestEdit(
  x: Int32Array,
  x0: number,
  x1: number,
  y: Int32Array,
  y0: number,
  y1: number,
): DiffLine[] {
  const n = x1 - x0;
  const m = y1 - y0;
  const whole = () => {
    const lines: DiffLine[] = [];
    for (let i = 0; i < n; i++) lines.push({ kind: 'del', before: x0 + i, after: -1 });
    for (let j = 0; j < m; j++) lines.push({ kind: 'add', before: -1, after: y0 + j });
    return lines;
  };
  if (!n || !m) return whole();
  const max = Math.min(n + m, MAX_CHANGES);
  // How far along x each diagonal k (x minus y) has got, at index k + offset.
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // Before each round d, what the round reads: the diagonals -d - 1 to d + 1.
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      // Down from diagonal k + 1 (a line added) or right from k - 1 (a line removed).
      let i =
        k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)
          ? v[offset + k + 1]!
          : v[offset + k - 1]! + 1;
      let j = i - k;
      while (i < n && j < m && x[x0 + i] === y[y0 + j]) {
        i++;
        j++;
      }
      v[offset + k] = i;
      if (i >= n && j >= m) return walkBack(trace, d, n, m, x0, y0);
    }
  }
  return whole();
}

// The way back from the end to the start through what each round left (trace), as lines in order.
function walkBack(
  trace: Int32Array[],
  rounds: number,
  n: number,
  m: number,
  x0: number,
  y0: number,
): DiffLine[] {
  const lines: DiffLine[] = [];
  let i = n;
  let j = m;
  for (let d = rounds; d > 0; d--) {
    const before = trace[d]!;
    // The round's diagonal -d - 1 is at index 0.
    const at = (k: number) => before[k + d + 1]!;
    const k = i - j;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const fromK = down ? k + 1 : k - 1;
    const fromI = at(fromK);
    const fromJ = fromI - fromK;
    // The diagonal run after the change, then the change itself.
    const startI = down ? fromI : fromI + 1;
    while (i > startI) {
      i--;
      j--;
      lines.push({ kind: 'same', before: x0 + i, after: y0 + j });
    }
    if (down) lines.push({ kind: 'add', before: -1, after: y0 + fromJ });
    else lines.push({ kind: 'del', before: x0 + fromI, after: -1 });
    i = fromI;
    j = fromJ;
  }
  while (i > 0) {
    i--;
    j--;
    lines.push({ kind: 'same', before: x0 + i, after: y0 + j });
  }
  return lines.toReversed();
}

// The lines onto `out`, each change's removed lines before its added ones, each in their order.
// (Pushed one at a time: a body of a hundred thousand lines is more than a call can spread.)
function grouped(lines: DiffLine[], out: DiffLine[]) {
  let removed: DiffLine[] = [];
  let added: DiffLine[] = [];
  const flush = () => {
    for (const line of removed) out.push(line);
    for (const line of added) out.push(line);
    removed = [];
    added = [];
  };
  for (const line of lines) {
    if (line.kind === 'del') removed.push(line);
    else if (line.kind === 'add') added.push(line);
    else {
      flush();
      out.push(line);
    }
  }
  flush();
}

// A line's tokens for diffWords: a JSON string, a number, a word, a run of blanks, or any other
// character.
const WORD =
  /"(?:\\.|[^"\\])*"?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[A-Za-z_$][\w$-]*|\s+|[^]/g;
// Two lines with more tokens than this between them (multiplied) aren't compared.
const MAX_WORD_CELLS = 40_000;

// [from, to) in a line.
export type Range = [number, number];

// The parts of a line changed into another, as the ranges of each that the other doesn't have,
// over their tokens: "member" and "admin" in `"role": "member",` and `"role": "admin",`. Null
// when the two share nothing but blanks, or are too long to compare: the whole line is the change
// then.
export function diffWords(
  before: string,
  after: string,
): { before: Range[]; after: Range[] } | null {
  const a = before.match(WORD) ?? [];
  const b = after.match(WORD) ?? [];
  if (a.length * b.length > MAX_WORD_CELLS) return null;
  // The longest run of tokens the two have in common, in order, from each pair of positions on.
  const width = b.length + 1;
  const common = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      common[i * width + j] =
        a[i] === b[j]
          ? common[(i + 1) * width + j + 1]! + 1
          : Math.max(common[(i + 1) * width + j]!, common[i * width + j + 1]!);
  const keepA: boolean[] = [];
  const keepB: boolean[] = [];
  let shared = false;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      if (/\S/.test(a[i]!)) shared = true;
      keepA[i++] = true;
      keepB[j++] = true;
    } else if (common[(i + 1) * width + j]! >= common[i * width + j + 1]!) i++;
    else j++;
  }
  if (!shared) return null;
  return { before: changed(a, keepA), after: changed(b, keepB) };
}

// The ranges of the tokens not kept, the ones side by side joined.
function changed(tokens: string[], kept: boolean[]) {
  const ranges: Range[] = [];
  let at = 0;
  tokens.forEach((token, index) => {
    const end = at + token.length;
    if (!kept[index]) {
      const last = ranges.at(-1);
      if (last && last[1] === at) last[1] = end;
      else ranges.push([at, end]);
    }
    at = end;
  });
  return ranges;
}
