// The sidebar footer's notice of the latest delete (undo-delete.ts): "Rule deleted" and Undo with
// its key, "⌘Z to undo" (Ctrl+Z elsewhere), for its five seconds; and the polite live region that
// says it once, "Rule deleted. Press Command Z to undo". The region is in the footer all along,
// empty between notices, as one that comes onto the page already filled isn't read out.
//
// While the notice shows it takes the footer's row, and the footer's buttons (`children`) come
// back when it goes: at the sidebar's usual width they fill the row, and the notice needs most of
// it, as it does in a 420 px panel. The two share one cell, the buttons keeping their places
// unseen, so the footer stays as tall as it was: where their words take two rows (Commit Mono at
// Larger), the notice may too, its Undo going under its words rather than cutting them short.
import type { ReactNode } from 'react';
import { useStore } from '../../../ui/use-store.ts';
import { cn } from '../../../ui/cn.ts';
import { Button } from '../../../ui/kit/button.tsx';
import { Icon } from '../../../ui/kit/icon.tsx';
import { Kbd, modKey, modKeyName, spokenKeys } from '../../../ui/kit/kbd.tsx';
import { setUndoFooter, undoDelete, undoStore } from './undo-delete.ts';

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
            className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-x-2 pl-2.5"
          >
            <Icon name="trash" size={14} className="flex-none text-t50" />
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
              <Kbd>{KEYS}</Kbd>
              to undo
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
