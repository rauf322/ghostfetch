// Keeps how far an element is scrolled under a name, and scrolls it back there when it's drawn
// again under that name, for as long as the page is open: a rule's pane, and its settings beside
// the body. Kept as it scrolls, since an element that isn't shown (in another view) reads as
// scrolled to the top.
import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

const kept = new Map<string, number>();

export function useKeptScroll(key: string, ref: RefObject<HTMLElement | null>) {
  // Before the browser paints, once what's inside has its size (the body editor sets its own
  // height in its layout effect, which runs first).
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const top = kept.get(key);
    if (top) element.scrollTop = top;
    const keep = () => kept.set(key, element.scrollTop);
    element.addEventListener('scroll', keep, { passive: true });
    return () => element.removeEventListener('scroll', keep);
  }, [key, ref]);
}
