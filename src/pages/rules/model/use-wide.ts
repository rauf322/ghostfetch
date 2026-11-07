// Whether an element is at least `width` wide, as it changes: the body's Diff needs the room to put
// two panes of lines side by side.
import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

export function useWide(ref: RefObject<HTMLElement | null>, width: number) {
  const [wide, setWide] = useState(true);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(() => setWide(element.clientWidth >= width));
    observer.observe(element);
    setWide(element.clientWidth >= width);
    return () => observer.disconnect();
  }, [ref, width]);
  return wide;
}
