// The sidebar footer's notice of the latest delete (undo-delete.ts): "Rule deleted" and Undo, an
// undo arrow before its key, "⌘Z to undo" (Ctrl+Z elsewhere), as variant A has it, for its five
// seconds, which wait while the pointer is on it or focus is in it from the keyboard; and the
// polite live region that says it once, "Rule deleted. Press Command Z to undo". The region is in
// the footer all along, empty between notices, as one that comes onto the page already filled
// isn't read out.
//
// While the notice shows it takes the footer's row, and the footer's icons (`children`) come back
// when it goes. The two share one cell, the icons keeping their places unseen, so the footer keeps
// its height wherever the notice fits on one row; where it doesn't (a narrow sidebar in a wide
// type), its Undo goes under its words rather than cutting them short.
import type { ReactNode } from 'react';
import { useStore } from '../../../ui/use-store.ts';
import { cn } from '../../../ui/cn.ts';
import { Button } from '../../../ui/kit/button.tsx';
import { Icon } from '../../../ui/kit/icon.tsx';
import { Kbd, modKey, modKeyName, spokenKeys } from '../../../ui/kit/kbd.tsx';
import {
  focusInNotice,
  pointerOnNotice,
  setUndoFooter,
  undoDelete,
  undoStore,
} from './undo-delete.ts';

const KEYS = modKey('Z');

// The footer's content, around its buttons.
export function UndoNotice({ children }: { children: ReactNode }) {
  const { notice } = useStore(undoStore);
  return (
    <>
      <span
        ref={setUndoFooter}
        aria-live="polite"
        data-slot="undo-announcer"
        className="sr-only"
      >
        {notice && (
          <span
            key={notice.number}
          >{`${notice.said}. Press ${spokenKeys(KEYS)} to undo`}</span>
        )}
      </span>
      <div className="grid min-w-0 flex-1 items-center">
        <div
          className={cn(
            'col-start-1 row-start-1 flex flex-wrap items-center gap-0.5',
            notice && 'invisible',
          )}
        >
          {children}
        </div>
        {notice && (
          <div
            data-testid="undo-notice"
            onPointerEnter={() => pointerOnNotice(true)}
            onPointerLeave={() => pointerOnNotice(false)}
            onFocus={(event) => focusInNotice(event.target as Element)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                focusInNotice(null);
            }}
            className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-x-2 pl-2.5"
          >
            <span className="min-w-0 truncate text-control text-t65">{notice.said}</span>
            <Button
              variant="cell"
              size="cell"
              data-testid="undo-notice-undo"
              aria-label={`${spokenKeys(KEYS)} to undo`}
              aria-keyshortcuts={modKeyName('Z')}
              onClick={undoDelete}
              className="ml-auto gap-1.5"
            >
              <Icon name="undo" size={14} className="flex-none" />
              <Kbd>{KEYS}</Kbd>
              to undo
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
