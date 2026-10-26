// The body editor (src/lib/editor/code-editor.ts, with its find bar and vim keys) as a React
// component, and CodeView: the same syntax colours for a body that's only read, like a captured
// response in Traffic.
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { ComponentProps, Ref } from 'react';
import { createCodeEditor, tokens } from '../lib/editor/code-editor.ts';
import type { CodeEditor as Editor, Language } from '../lib/editor/code-editor.ts';
import { cn } from '../lib/utils.ts';
import '../lib/editor/code-editor.css';

interface CodeEditorProps extends Omit<ComponentProps<'div'>, 'onChange' | 'ref'> {
  // Only where the editor starts: it keeps its own text, undo history and vim state from then on.
  // To start over with another value or language, give the component a new key.
  value: string;
  language?: Language;
  // Every edit, as the whole text.
  onChange?: (value: string) => void;
  // The editor itself, for Format (replace()), the Vim switch (setVim()) and focus.
  ref?: Ref<Editor | null>;
}

export function CodeEditor({
  value,
  language = 'json',
  onChange,
  ref,
  className,
  ...props
}: CodeEditorProps) {
  const slot = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const [editor] = useState(() =>
    createCodeEditor({
      value,
      language,
      onChange: (text) => onChangeRef.current?.(text),
    }),
  );
  useImperativeHandle(ref, () => editor, [editor]);
  useEffect(() => {
    slot.current!.append(editor.root);
    return () => editor.root.remove();
  }, [editor]);
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
  const pieces = useMemo(() => (highlight ? tokens(text) : null), [text, highlight]);
  return (
    <pre
      data-slot="code-view"
      className={cn(
        'max-h-[420px] overflow-auto border border-border bg-code px-3 py-2 text-small leading-[1.75] tracking-normal whitespace-pre text-t65 [tab-size:2] scroll-thin',
        className,
      )}
    >
      {pieces
        ? pieces.map(([kind, part], index) =>
            kind ? (
              <span key={index} className={`tk-${kind}`}>
                {part}
              </span>
            ) : (
              part
            ),
          )
        : text}
    </pre>
  );
}
