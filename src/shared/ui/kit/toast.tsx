import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import type { ReactNode } from 'react';
import { cn } from '../cn.ts';
import { Button } from './button.tsx';
import { Icon } from './icon.tsx';
import type { IconName } from './icon.tsx';

// Toasts, after Sonner's: small cards at the bottom right of the window, the newest nearest the
// edge, up to three in a column. Each has a title, a line under it when there's more to say, an
// icon at its left (a green check for something done, a warning mark for an error, or one of its
// own), a button like Undo at its right, a × at its corner while the pointer is over it, and it
// goes with a swipe down or right. The pointer over it holds it. An error is inverted, white, as
// errors are here (never red). Built on Base UI's Toast: Sonner itself adds a <style> tag the
// CSP blocks.
//
// notify() shows one; toast.add() takes all of Base UI's options (`type`: info, success or
// error; `data.icon`: an icon other than the kind's own).
export const toast = ToastPrimitive.createToastManager();
export const createToastManager = ToastPrimitive.createToastManager;

type Kind = 'info' | 'success' | 'error';

// The icon a kind gets unless one is given; a plain notice has none.
const ICONS: Partial<Record<string, IconName>> = { success: 'check', error: 'alert' };

interface NotifyOptions {
  // A second line, for what the title doesn't say.
  description?: string;
  // A button on the toast, like Undo, which closes it and runs onAction.
  action?: string;
  onAction?: () => void;
  kind?: Kind;
  icon?: IconName;
  // How long it shows, in ms: 3 s, 5 s for an error, 6 s with an action, so there's time to use
  // it.
  duration?: number;
}

export function notify(
  title: string,
  { description, action, onAction, kind = 'info', icon, duration }: NotifyOptions = {},
) {
  const id = toast.add({
    title,
    description,
    type: kind,
    data: { icon },
    timeout: duration ?? (action ? 6000 : kind === 'error' ? 5000 : 3000),
    actionProps: action
      ? {
          children: action,
          onClick: () => {
            toast.close(id);
            onAction?.();
          },
        }
      : undefined,
  });
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();
  // Base UI keeps toasts over the limit in the page, marked data-limited, until the others go.
  return toasts.map((item) => {
    const error = item.type === 'error';
    const icon =
      (item.data as { icon?: IconName } | undefined)?.icon ?? ICONS[item.type ?? ''];
    return (
      <ToastPrimitive.Root
        key={item.id}
        toast={item}
        data-slot="toast"
        className={cn(
          'group/toast relative flex w-full items-start gap-2.5 rounded-lg border px-3.5 py-3 text-small shadow-menu select-none',
          // It rises in and fades out, or follows a swipe off the edge.
          'transition-[opacity,translate] duration-200 data-starting-style:translate-y-2 data-starting-style:opacity-0 data-ending-style:opacity-0 data-limited:hidden',
          'data-swiping:transition-none data-swiping:[translate:var(--toast-swipe-movement-x)_var(--toast-swipe-movement-y)]',
          'data-ending-style:data-[swipe-direction=down]:[translate:0_calc(var(--toast-swipe-movement-y)_+_150%)] data-ending-style:data-[swipe-direction=right]:[translate:calc(var(--toast-swipe-movement-x)_+_150%)_0]',
          error
            ? 'border-foreground bg-foreground text-inverse'
            : 'border-border bg-card text-foreground',
        )}
      >
        {icon && (
          <Icon
            name={icon}
            size={15}
            className={cn('mt-px flex-none', icon === 'check' && !error && 'text-signal')}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-px">
          <ToastPrimitive.Title className="m-0 font-medium" />
          <ToastPrimitive.Description
            className={cn('m-0 text-label', error ? 'text-inverse/70' : 'text-t50')}
          />
        </div>
        <ToastPrimitive.Action
          data-slot="toast-action"
          render={<Button size="sm" className="-my-1 -mr-1 flex-none" />}
        />
        <ToastPrimitive.Close
          aria-label="Close"
          className={cn(
            'absolute -top-2 -left-2 flex size-5 cursor-pointer items-center justify-center rounded-full border opacity-0 transition-opacity duration-150 group-hover/toast:opacity-100 focus-visible:opacity-100',
            error
              ? 'border-foreground bg-foreground text-inverse'
              : 'border-border bg-card text-t50 hover:text-foreground',
          )}
        >
          <Icon name="close" size={10} />
        </ToastPrimitive.Close>
      </ToastPrimitive.Root>
    );
  });
}

// A page's toasts, around everything else at its root. `inline` keeps them where it's rendered
// instead of at the window's corner (for the kit page).
export function Toaster({
  children,
  toastManager = toast,
  inline = false,
  ...props
}: ToastPrimitive.Provider.Props & { inline?: boolean; children?: ReactNode }) {
  const viewport = (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        'flex flex-col-reverse gap-2 outline-none',
        inline
          ? 'relative w-[320px]'
          : 'fixed right-3 bottom-3 z-50 w-[min(360px,calc(100vw_-_24px))]',
      )}
    >
      <ToastList />
    </ToastPrimitive.Viewport>
  );
  return (
    <ToastPrimitive.Provider
      toastManager={toastManager}
      limit={3}
      timeout={3000}
      {...props}
    >
      {children}
      {inline ? viewport : <ToastPrimitive.Portal>{viewport}</ToastPrimitive.Portal>}
    </ToastPrimitive.Provider>
  );
}
