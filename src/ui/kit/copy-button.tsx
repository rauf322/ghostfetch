// A copy that says it worked in the control that did it, not in a toast across the window: for a
// second the icon is a green check and the words say "Copied", and a screen reader is told once
// ("Copied the URL"). Traffic's Copy URL, Copy as cURL and Copy body.
//
// - Pressing it again while it says "Copied" copies again and starts the second over. It stays
//   pressable throughout, rather than off for that second (as T3 Code's are), which would take
//   the keyboard's focus from it.
// - It keeps its width: both of its looks sit in one cell, so it's as wide as the wider.
// - Its name for a screen reader stays its words ("Copy URL"): "Copied" is only drawn, and a polite
//   live region beside it says "Copied the URL" once per copy. When the words come back, the
//   region is emptied, which a screen reader doesn't read out.
// - A copy the browser refuses (Firefox's sidebar while it hasn't the focus, a page without the
//   permission) changes nothing in it, and a toast says so and what to do.
//
// useCopied() is the same for a control of another shape (an icon in a row).
import { useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';
import { Button } from './button.tsx';
import { Icon } from './icon.tsx';
import type { IconName } from './icon.tsx';
import { notify } from './toast.tsx';

// How long a control says "Copied".
export const COPIED_FOR = 1000;

// The clipboard for a control that copies `what` ("the URL"): copy() writes it and, if that
// worked, `copied` is true for COPIED_FOR, started over by each copy; `live` is the polite live
// region that says so, to draw beside the control. A refused copy leaves `copied` false and shows
// the error toast.
export function useCopied(what: string) {
  const [copied, setCopied] = useState(false);
  // Each copy's own announcement, so a second copy is read out again.
  const [copies, setCopies] = useState(0);
  const timer = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  async function copy(text: string) {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setCopied(false);
      notify(`Couldn't copy ${what}`, {
        kind: 'error',
        description:
          "The browser didn't let Ghostfetch use the clipboard. Click in Ghostfetch, then copy again.",
      });
      return false;
    }
    setCopied(true);
    setCopies((count) => count + 1);
    timer.current = window.setTimeout(() => setCopied(false), COPIED_FOR);
    return true;
  }
  const live = (
    <span aria-live="polite" className="sr-only" data-slot="copy-announcer">
      {copied && <span key={copies}>{`Copied ${what}`}</span>}
    </span>
  );
  return { copied, copy, live };
}

export function CopyButton({
  text,
  what,
  icon,
  children,
  className,
  onClick,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children'> & {
  // What to copy, or what makes it when it's pressed (a cURL command of a large body).
  text: string | (() => string);
  // What it copies, in a few words: "the URL", for "Copied the URL" and "Couldn't copy the URL".
  what: string;
  icon: IconName;
  // Its words at rest, which stay its name: "Copy URL".
  children: string;
}) {
  const { copied, copy, live } = useCopied(what);
  return (
    <>
      <Button
        data-slot="copy-button"
        data-copied={copied || undefined}
        className={cn('gap-1.5', className)}
        onClick={(event) => {
          onClick?.(event);
          // It never fails: a refused copy is shown, not thrown.
          copy(typeof text === 'function' ? text() : text);
        }}
        {...props}
      >
        <span className="inline-grid justify-items-center">
          <span
            data-part="words"
            className={cn(
              'col-start-1 row-start-1 flex items-center gap-1.5',
              copied && 'opacity-0',
            )}
          >
            <Icon name={icon} size={14} className="flex-none" />
            {children}
          </span>
          <span
            data-part="copied"
            aria-hidden="true"
            className={cn(
              'col-start-1 row-start-1 flex items-center gap-1.5',
              !copied && 'opacity-0',
            )}
          >
            <Icon name="check" size={14} className="flex-none text-signal" />
            Copied
          </span>
        </span>
      </Button>
      {live}
    </>
  );
}
