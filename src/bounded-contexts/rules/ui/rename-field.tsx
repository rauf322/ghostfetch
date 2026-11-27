// A name in the rule list as a field, to type a new one in: a group's in its header (just made,
// copied, double-clicked, or F2) and a rule's in its row (F2); and in the open rule's crumbs. Enter
// or leaving it gives the name typed, Esc keeps the one it had. One that's empty once `tidy` has
// had it is a rule's to take (`allowEmpty`: its URL names it then, as the open rule's name field
// has it) and a group's to turn down: the name stays as it was. `rename` gives the name, and says
// false to keep the field open for another (a group's name another group has). `onDone(byKey)`
// once it's done, by Enter or Esc (true: focus then goes back to the row it's in) or by leaving
// it. While an input method is putting a character together, Enter and Esc are its own (picking a
// candidate, dropping one), not the field's.
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../../ui/cn.ts';

export function RenameField({
  name,
  label,
  testId,
  maxLength,
  tidy = (text) => text.trim(),
  allowEmpty = false,
  rename,
  onDone,
  className,
}: {
  name: string;
  label: string;
  testId: string;
  maxLength?: number;
  tidy?: (text: string) => string;
  allowEmpty?: boolean;
  rename: (name: string) => boolean;
  onDone: (byKey: boolean) => void;
  className?: string;
}) {
  const [text, setText] = useState(name);
  const field = useRef<HTMLInputElement>(null);
  // Done once: a field that goes away can still lose focus on its way.
  const done = useRef(false);
  // Focus, the name selected to type over; and again on the next frames where the field can't
  // have it yet: in a sidebar ⌘B hid, shown for it (renaming.ts), which is invisible until it
  // starts sliding open. A menu that made the field gives focus back to its button as it shuts,
  // where the field couldn't take it; the field takes it from there.
  useEffect(() => {
    let frame = 0;
    let tries = 10;
    const take = () => {
      const input = field.current;
      if (!input) return;
      input.focus();
      input.select();
      tries -= 1;
      if (document.activeElement !== input && tries > 0)
        frame = requestAnimationFrame(take);
    };
    take();
    return () => cancelAnimationFrame(frame);
  }, []);

  function finish(byKey: boolean) {
    done.current = true;
    onDone(byKey);
  }

  function commit(byKey: boolean) {
    if (done.current) return;
    const next = tidy(text);
    if ((next || allowEmpty) && next !== name && !rename(next)) return;
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
        if (event.nativeEvent.isComposing) return;
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
