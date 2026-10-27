// The shapes vim's parts pass each other: the text an operator works on, where a motion takes
// the cursor, a command read from the keys, and the find bar opened as vim's search line.

// Text an operator works on: [start, end), whole lines (with their line breaks) when
// `linewise`. `from` is where it began before it grew to whole lines.
export interface Range {
  start: number;
  end: number;
  linewise?: boolean;
  from?: number;
}

// Where a motion takes the cursor. An `inclusive` motion takes in the character it lands on;
// `want` is the column j and k aim for afterwards, or `keepWant` leaves that column as it was.
export interface MotionResult {
  pos: number;
  linewise?: boolean;
  inclusive?: boolean;
  want?: number;
  keepWant?: boolean;
}

// A command read by parse(), e.g. "3dw" is { operator: 'd', motion: 'w', count: 3, hasCount: true }.
export interface Command {
  operator?: string;
  motion?: string;
  object?: string;
  around?: boolean;
  lines?: boolean;
  search?: string;
  action?: string;
  arg?: string;
  count: number;
  hasCount: boolean;
}

// The find bar opened as vim's "/" or "?" search line, searching from `from`; `then` is an
// operator waiting for the match ("d/foo").
export interface SearchLine {
  backward: boolean;
  from: number;
  then?: Command;
}
