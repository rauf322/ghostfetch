// The room the body editor may grow into: the pane's height, less everything else the response
// section shows (its title bar, its padding, and the Body tab's other rows), so that with the
// section scrolled to the top of the pane the whole section fits and a long body scrolls inside the
// editor. Kept in --code-max on the section, which code-editor.css reads; it follows the window
// and the section's content.
import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

export function useEditorRoom(
  section: RefObject<HTMLElement | null>,
  panels: RefObject<HTMLElement | null>,
  bodyPanel: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    const parts = [section.current, panels.current, bodyPanel.current];
    if (parts.some((part) => !part)) return undefined;
    const [sectionBox, panelsBox, bodyBox] = parts as HTMLElement[];
    const pane = sectionBox.closest<HTMLElement>('[data-slot="pane-scroll"]');
    if (!pane) return undefined;
    const measure = () => {
      const editor = bodyBox.querySelector<HTMLElement>('.code');
      if (!editor) return;
      // The panels sit on top of each other, as tall as the tallest: what the section adds
      // around them, plus what the Body tab has besides the editor.
      const around =
        sectionBox.offsetHeight -
        panelsBox.offsetHeight +
        bodyBox.offsetHeight -
        editor.offsetHeight;
      sectionBox.style.setProperty(
        '--code-max',
        `${Math.max(0, pane.clientHeight - around)}px`,
      );
    };
    const observer = new ResizeObserver(measure);
    for (const box of [pane, sectionBox, bodyBox]) observer.observe(box);
    measure();
    return () => observer.disconnect();
  }, [section, panels, bodyPanel]);
}
