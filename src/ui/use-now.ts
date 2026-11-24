// The screens' clock (lib/clock.ts): the time now, moving on every 15 s, on one timer for every
// component that reads it. Traffic's list groups its requests by it, so "Just now" becomes "A few
// minutes ago" without a new request coming in; a rule's row in the editor's list says from it
// how long ago the rule last answered ("· 4m"), and draws that again only when those words change,
// so at most once a minute.
import { useSyncExternalStore } from 'react';
import { createClock } from '../lib/index.ts';

const clock = /* @__PURE__ */ createClock(15_000);

// The time now, as of the clock's last tick: the component draws again at every tick.
export function useNow() {
  return useSyncExternalStore(clock.subscribe, clock.now);
}

// One value worked out from the time now, for a component that draws again only when that value
// changes. `pick` must return a string, number or boolean, so that the same answer counts as no
// change.
export function useNowValue<Value extends string | number | boolean>(
  pick: (now: number) => Value,
): Value {
  return useSyncExternalStore(clock.subscribe, () => pick(clock.now()));
}
