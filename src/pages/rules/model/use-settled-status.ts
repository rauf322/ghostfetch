// A body's check as the editor shows it. A new mistake shows once typing pauses for a moment
// (SETTLE ms), so it doesn't flash at every keystroke; a fixed one goes at once; and one that only
// moved, because something was typed before it, stays up. Until a new mistake shows, the line
// under the body is empty.
import { useEffect, useState } from 'react';
import type { CodeStatus } from '../lib/rule-checks.ts';

const SETTLE = 500;

// What makes two reports the same mistake: its message, and where it is, counted from the start
// or from the end of the text (typing before a mistake moves it from the start, not the end).
// As a string, one part a line (no message has a line break), so React can compare it.
function identity(status: CodeStatus, length: number) {
  const { problem } = status;
  return problem
    ? `${problem.message}\n${problem.from}\n${length - problem.from}`
    : `${status.text}\n\n`;
}
function same(a: string, b: string) {
  if (a === b) return true;
  const [aMessage, aFrom, aFromEnd] = a.split('\n');
  const [bMessage, bFrom, bFromEnd] = b.split('\n');
  return aMessage === bMessage && !!aFrom && (aFrom === bFrom || aFromEnd === bFromEnd);
}

export function useSettledStatus(status: CodeStatus | null, length: number) {
  const current = status?.tone === 'bad' ? identity(status, length) : '';
  // The mistake on show, as of its last report. A rule opened with a mistake shows it at once.
  const [shown, setShown] = useState(current);
  const visible = !current || (!!shown && same(shown, current));
  // Gone, or still on show and only moved: keep up with it right away, while rendering, so the
  // next report compares with where it is now.
  if (visible && shown !== current) setShown(current);

  // New: show it once typing pauses.
  useEffect(() => {
    if (visible) return undefined;
    const timer = setTimeout(() => setShown(current), SETTLE);
    return () => clearTimeout(timer);
  }, [current, visible]);

  return visible ? status : { text: '' };
}
