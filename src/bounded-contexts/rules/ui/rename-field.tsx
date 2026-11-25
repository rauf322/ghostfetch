// A name in the rule list as a field, to type a new one in: a group's in its header (just made,
// copied, double-clicked, or F2) and a rule's in its row (F2). Enter or leaving it gives the name
// typed, Esc keeps the one it had, and one that's empty once `tidy` has had it is turned down: the
// name stays as it was. `rename` gives the name, and says false to keep the field open for
// another (a group's name another group has). `onDone(byKey)` once it's done, by Enter or Esc
// (true: focus then goes back to the row it's in) or by leaving it.
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../../ui/cn.ts';

export function RenameField({
  name,
  label,
  testId,
  maxLength,
  tidy = (text) => text.trim(),
  rename,
  onDone,
  className,
}: {
  name: string;
  label: string;
  testId: string;
  maxLength?: number;
  tidy?: (text: string) => string;
  rename: (name: string) => boolean;
  onDone: (byKey: boolean) => void;
  className?: string;
}) {
  const [text, setText] = useState(name);
  const field = useRef<HTMLInputElement>(null);
  // Done once: a field that goes away can still lose focus on its way.
  const done = useRef(false);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  function finish(byKey: boolean) {
    done.current = true;
    onDone(byKey);
  }

  function commit(byKey: boolean) {
    if (done.current) return;
    const next = tidy(text);
    if (next && next !== name && !rename(next)) return;
    finish(byKey);
  }

  return (
    <input
      ref={field}
      data-testid={testId}
      aria-label={label}
      value={text}
      maxLength={maxLength}
      spellCheck={false}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          finish(true);
        }
      }}
      onBlur={() => commit(false)}
      className={cn(
        'h-7 min-w-0 flex-1 rounded-sm bg-pressed px-1.5 text-title text-strong outline-none',
        className,
      )}
    />
  );
}
