// The list beside what's open (the rules, or Traffic's requests) as a sidebar you can hide, from
// 760px wide: the button at the top left of what's open, or Cmd/Ctrl+B, gives the list's room to
// the rule or the request, and brings the list back. Remembered in this browser (localStorage).
// A narrow side panel shows one of the two at a time anyway, so the button isn't there.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { cn } from './cn.ts';
import { Button } from './kit/button.tsx';
import { Icon } from './kit/icon.tsx';

const KEY = 'ghostfetch.sidebar';
const listeners = new Set<() => void>();
let hidden = localStorage.getItem(KEY) === 'hidden';

function toggle() {
  hidden = !hidden;
  if (hidden) localStorage.setItem(KEY, 'hidden');
  else localStorage.removeItem(KEY);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useSidebarHidden = () => useSyncExternalStore(subscribe, () => hidden);

// ⌘B on a Mac and Ctrl+B elsewhere, as code editors have it.
const MAC = /Mac/.test(navigator.userAgent);
const SHORTCUT = MAC ? '⌘B' : 'Ctrl+B';

export function SidebarToggle({ className }: { className?: string }) {
  const isHidden = useSidebarHidden();
  const button = useRef<HTMLButtonElement>(null);

  // Only a button on screen answers the keys, as both tabs stay mounted and a narrow panel hides
  // the button; and not a key something else has already handled (defaultPrevented).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!mod || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'b')
        return;
      if (event.defaultPrevented || !button.current?.checkVisibility()) return;
      event.preventDefault();
      if (!event.repeat) toggle();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const label = isHidden ? 'Show the list' : 'Hide the list';
  return (
    <Button
      ref={button}
      variant="ghost"
      size="icon"
      data-testid="sidebar-toggle"
      aria-label={label}
      aria-expanded={!isHidden}
      title={`${label} (${SHORTCUT})`}
      onClick={toggle}
      className={cn('flex-none max-wide:hidden', className)}
    >
      <Icon name="sidebar" size={18} />
    </Button>
  );
}
