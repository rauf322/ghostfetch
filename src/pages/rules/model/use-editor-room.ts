// The room the body editor may grow into: down to where the response section, the last thing in
// the pane, ends at the pane's bottom with the pane scrolled to the top. So the editor is never
// taller than the window has room for, and a longer body scrolls inside it. Kept in --code-max on
// the section, which code-editor.css reads (with 120 px as the least); it follows the window,
// what's above the editor and what's under it.
import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

export function useEditorRoom(
  section: RefObject<HTMLElement | null>,
  bodyPanel: RefObject<HTMLElement | null>,
) {
  const measure = useRef(() => {});

  useLayoutEffect(() => {
    const sectionBox = section.current;
    const bodyBox = bodyPanel.current;
    const pane = sectionBox?.closest<HTMLElement>('[data-slot="pane-scroll"]');
    if (!sectionBox || !bodyBox || !pane) return undefined;
    measure.current = () => {
      const editor = bodyBox.querySelector<HTMLElement>('.code');
      if (!editor) return;
      const box = editor.getBoundingClientRect();
      // Where the pane's content starts, wherever it's scrolled to.
      const contentTop =
        pane.getBoundingClientRect().top + pane.clientTop - pane.scrollTop;
      // Under the editor: the rest of the Body tab (which is as tall as its content), and the
      // section's padding and border.
      const style = getComputedStyle(sectionBox);
      const under =
        bodyBox.getBoundingClientRect().bottom -
        box.bottom +
        parseFloat(style.paddingBottom) +
        parseFloat(style.borderBottomWidth);
      const room = pane.clientHeight - (box.top - contentTop) - under;
      sectionBox.style.setProperty('--code-max', `${Math.max(0, Math.floor(room))}px`);
    };
    // The pane's size, and anything in it that changes size, moves the editor or what's under it.
    const observer = new ResizeObserver(() => measure.current());
    for (const box of [pane, ...pane.children, bodyBox]) observer.observe(box);
    measure.current();
    return () => observer.disconnect();
  }, [section, bodyPanel]);

  // And after every render: something can appear above the section without anything changing
  // size, such as Chrome's error about the rule.
  useLayoutEffect(() => measure.current());
}
