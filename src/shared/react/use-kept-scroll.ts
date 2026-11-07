// Keeps how far elements are scrolled under a name, and scrolls them back there when they're
// drawn again under it, for as long as the page is open: the rule editor's pane and its settings,
// for each rule. Kept as they scroll: an element that isn't shown (in another view) reads as
// scrolled to the top.
import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

const kept = new Map<string, number[]>();

export function useKeptScroll(
  key: string,
  first: RefObject<HTMLElement | null>,
  second: RefObject<HTMLElement | null>,
) {
  // Before the browser paints, once what's inside has its size (the body editor sets its own
  // height in its layout effect, which runs first).
  useLayoutEffect(() => {
    const elements = [first.current, second.current];
    const tops = kept.get(key) ?? [0, 0];
    const stops = elements.map((element, index) => {
      if (!element) return undefined;
      if (tops[index]) element.scrollTop = tops[index]!;
      const scrolled = () => {
        tops[index] = element.scrollTop;
        kept.set(key, tops);
      };
      element.addEventListener('scroll', scrolled, { passive: true });
      return () => element.removeEventListener('scroll', scrolled);
    });
    return () => {
      for (const stop of stops) stop?.();
    };
  }, [key, first, second]);
}
