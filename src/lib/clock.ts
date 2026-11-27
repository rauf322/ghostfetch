// A clock for the screens to share: the time now, moving on every `every` ms while anything
// listens, on one timer however many listen, and stopped while none do. What it says changes only
// at a tick, so asking twice between two gets the same answer (as React's useSyncExternalStore
// needs); asking once it's a tick old (it was stopped, or has never been read) gets the time now.
export interface Clock {
  now: () => number;
  subscribe: (listener: () => void) => () => void;
}

export function createClock(every: number): Clock {
  let time = -Infinity;
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();
  return {
    now() {
      if (Date.now() - time >= every) time = Date.now();
      return time;
    },
    subscribe(listener) {
      listeners.add(listener);
      timer ??= setInterval(() => {
        time = Date.now();
        for (const each of listeners) each();
      }, every);
      return () => {
        listeners.delete(listener);
        if (listeners.size || timer === undefined) return;
        clearInterval(timer);
        timer = undefined;
      };
    },
  };
}
