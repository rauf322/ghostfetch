// The body editor (engine/code-editor.ts, with its find bar and vim keys) as a React component,
// and CodeView: the same syntax colours for a body that's only read, like a captured response in
// Traffic.
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentProps, Ref } from 'react';
import { cn } from '../cn.ts';
import { colour, countLines, createCodeEditor } from './engine/code-editor.ts';
import type { CodeProblem, CodeEditor as Editor } from './engine/code-editor.ts';
import { chunks } from './engine/highlight.ts';
import './code-editor.css';

interface CodeEditorProps extends Omit<ComponentProps<'div'>, 'onChange' | 'ref'> {
  // Only where the editor starts: it keeps its own text, undo history and vim state from then on.
  // To start over with another value, give the component a new key.
  value: string;
  // Every edit, as the whole text.
  onChange?: (value: string) => void;
  // As tall as the text, up to the room the page gives it in --code-max (and at least --code-fill,
  // if the page sets that). Only where it starts.
  fit?: boolean;
  // A mistake in the current text to mark, or null.
  problem?: CodeProblem | null;
  // The editor itself, for Format (replace()), the Vim switch (setVim()), going to a mistake
  // (reveal()) and focus.
  ref?: Ref<Editor | null>;
}

export function CodeEditor({
  value,
  onChange,
  fit = false,
  problem = null,
  ref,
  className,
  ...props
}: CodeEditorProps) {
  const slot = useRef<HTMLDivElement>(null);
  const [editor] = useState(() => createCodeEditor({ value, fit }));
  useImperativeHandle(ref, () => editor, [editor]);
  useEffect(() => {
    slot.current!.append(editor.root);
    return () => editor.root.remove();
  }, [editor]);
  // Every edit reaches the textarea as an input event, whether it's typed, made with vim's keys
  // or by Format. The editor's own listener has redrawn the highlighting by then.
  useEffect(() => {
    if (!onChange) return undefined;
    const changed = () => onChange(editor.value);
    editor.textarea.addEventListener('input', changed);
    return () => editor.textarea.removeEventListener('input', changed);
  }, [editor, onChange]);
  // Before the browser paints: an edit clears the marks, and the redraw it causes puts them back
  // for the new text, so they never show in the wrong place.
  useLayoutEffect(() => {
    editor.setProblem(problem);
  }, [editor, problem]);
  return <div data-slot="code-editor" ref={slot} className={className} {...props} />;
}

// A read-only body in the editor's colours: highlighted as JSON, or else as plain text.
export function CodeView({
  text,
  highlight = true,
  className,
}: {
  text: string;
  highlight?: boolean;
  className?: string;
}) {
  const view = useRef<HTMLPreElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  // Before the browser paints, so the text never shows without its colours.
  useLayoutEffect(
    () => fillView(view.current!, content.current!, text, highlight),
    [text, highlight],
  );
  return (
    <pre
      ref={view}
      data-slot="code-view"
      className={cn(
        'max-h-[420px] overflow-auto rounded-lg border border-border bg-code px-3.5 py-2.5 font-mono text-[11.5px] leading-[1.75] whitespace-pre text-t65 [tab-size:2] scroll-thin',
        className,
      )}
    >
      {/* The text in a block as wide as its longest line: the view is as wide as the drawer,
          which changes width as the list's edge is dragged, and a block with a width of its own
          keeps its layout then, where text straight in the view was laid out again every frame
          (3 ms for a response of 3,000 lines). fillView() puts the text in. */}
      <span ref={content} className="block w-max" />
    </pre>
  );
}

// Puts a CodeView's text in it. A long one is cut into pieces (chunks()), each of which gets its
// colours once it's scrolled near, as in the body editor: with every token coloured at once,
// opening a response of 8,000 lines took 50 ms, and a longer one longer still. Returns what stops
// it.
function fillView(
  view: HTMLElement,
  content: HTMLElement,
  text: string,
  highlight: boolean,
) {
  if (!highlight) {
    content.textContent = text;
    return undefined;
  }
  const pieces = chunks(text);
  if (pieces.length === 1) {
    colour(content, text);
    return undefined;
  }
  // The line each piece starts on, and how many lines the view shows at most: its line height
  // and the tallest it gets, which only need its style, not its layout.
  const starts: number[] = [];
  let lines = 0;
  for (const piece of pieces) {
    starts.push(lines);
    lines += countLines(piece) - 1;
  }
  const style = getComputedStyle(view);
  const lineHeight = parseFloat(style.lineHeight);
  const screen = Math.ceil(
    (parseFloat(style.maxHeight) || window.innerHeight) / lineHeight,
  );
  const elements = pieces.map((piece) => {
    const element = document.createElement('span');
    element.textContent = piece;
    return element;
  });
  const coloured = pieces.map(() => false);
  // The pieces on screen and a screen's worth either side of it get their colours, and keep them.
  const paint = (scrollTop: number) => {
    const first = Math.floor(scrollTop / lineHeight) - screen;
    const last = first + 3 * screen;
    pieces.forEach((piece, index) => {
      if (
        coloured[index] ||
        starts[index]! > last ||
        (starts[index + 1] ?? lines + 1) < first
      )
        return;
      coloured[index] = true;
      colour(elements[index]!, piece);
    });
  };
  // Where the view is scrolled to (another request's response may have been in it) is read
  // before the new text goes in: read after, it would have the browser lay all of it out twice.
  paint(view.scrollTop);
  content.replaceChildren(...elements);
  const scrolled = () => paint(view.scrollTop);
  view.addEventListener('scroll', scrolled, { passive: true });
  return () => view.removeEventListener('scroll', scrolled);
}
