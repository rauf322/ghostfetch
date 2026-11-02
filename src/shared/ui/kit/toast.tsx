import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import type { ReactNode } from 'react';
import { cn } from '../cn.ts';

// The toast: one inverted white pill at a time, centred over the bottom bar, with an underlined
// action. An error is the same pill in black with a white border. Built on Base UI's
// Toast: Sonner, shadcn's usual toast, adds a <style> tag the CSP blocks.
//
// notify() shows one; toast.add() takes all of Base UI's options.
export const toast = ToastPrimitive.createToastManager();
export const createToastManager = ToastPrimitive.createToastManager;

interface NotifyOptions {
  // A button on the toast, like Undo, which closes it and runs onAction.
  action?: string;
  onAction?: () => void;
  kind?: 'info' | 'error';
  // How long it shows, in ms; twice that with an action, so there's time to use it.
  duration?: number;
}

export function notify(
  message: string,
  { action, onAction, kind = 'info', duration = 2600 }: NotifyOptions = {},
) {
  const id = toast.add({
    title: message,
    type: kind === 'error' ? 'error' : undefined,
    timeout: action ? duration * 2 : duration,
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
  // Base UI keeps toasts over the limit in the page, marked data-limited; only the newest shows.
  return toasts.map((item) => (
    <ToastPrimitive.Root
      key={item.id}
      toast={item}
      data-slot="toast"
      className="flex items-center gap-3.5 rounded-lg bg-foreground px-4 py-2.5 text-small font-medium text-inverse shadow-menu transition-[opacity,translate] duration-150 select-none data-ending-style:opacity-0 data-limited:hidden data-starting-style:translate-y-2 data-starting-style:opacity-0 data-[type=error]:border data-[type=error]:border-foreground data-[type=error]:bg-background data-[type=error]:text-foreground"
    >
      <ToastPrimitive.Title className="m-0 min-w-0 flex-1 font-normal" />
      <ToastPrimitive.Action className="flex-none cursor-pointer text-control font-semibold underline underline-offset-3" />
    </ToastPrimitive.Root>
  ));
}

// A page's toasts, around everything else at its root. `inline` keeps them where it's rendered
// instead of over the bottom bar (for the kit page).
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
        inline
          ? 'relative w-max outline-none'
          : 'fixed bottom-[52px] left-1/2 z-50 w-max max-w-[calc(100%-24px)] -translate-x-1/2 outline-none',
      )}
    >
      <ToastList />
    </ToastPrimitive.Viewport>
  );
  return (
    <ToastPrimitive.Provider
      toastManager={toastManager}
      limit={1}
      timeout={2600}
      {...props}
    >
      {children}
      {inline ? viewport : <ToastPrimitive.Portal>{viewport}</ToastPrimitive.Portal>}
    </ToastPrimitive.Provider>
  );
}
