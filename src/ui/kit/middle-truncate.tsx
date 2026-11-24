// A URL cut short in the middle, so its end stays: "/api/search?q=inv…oices&page=2" rather than
// "/api/search?q=invoices&pa…", as the end is what tells two URLs apart. After T3 Code's (its
// idea; none of its code, which measures where this doesn't). CSS only: the text is split once
// into a head, which gives way with the ellipsis, and a tail, which doesn't (tailStart()), side by
// side in a flex row; no measuring, so a row draws as fast as one that cuts at the end.
//
// - Shorter than its tail, a text is all tail: no head, so no empty box beside it.
// - In less room than the tail itself, the head is gone and the tail gives way too, at its start
//   with the ellipsis, so its very end still shows ("…ge=2"), and nothing leaves the row: the
//   tail is a right-to-left box, whose ellipsis is at its left, around its text set left to
//   right on its own (dir), which it doesn't change while it has room.
// - The ellipsis comes after the last whole character that fits, as CSS draws it, so a cut can
//   leave a gap of up to a character before the end, clearest in a monospace font; closing it
//   would take measuring, as T3 Code's does.
// - The parts keep their spaces (white-space: pre, the text's runs of spaces made one first, as
//   CSS would), so "/graphql GetInvoices" cut before GetInvoices keeps its space.
// - The whole text stays in the page, the middle only hidden: selected and copied, it's the text
//   as it is. Both browsers write a line break between the two parts when they copy them (Chrome
//   between any two flex items; Firefox between two that keep their spaces, though its
//   Selection.toString() doesn't), so where a selection crosses from a head into its tail, the
//   copy is put together without it (copyWhole()).
// - A screen reader hears it once and whole: the two parts are aria-hidden (read as two, with a
//   space between, in Chrome), and the text is read from a visually hidden ::after.
//
// `data-full` holds the whole text, for that ::after and for a row that shows it in a tooltip
// only when it's cut (isCut()).
import { useEffect } from 'react';
import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';

// The end that stays: the last path segment with its slash, if it's this short...
const SEGMENT = 16;
// ...or else the last 10 characters, moved back to start after a break within the last 16.
const END = 10;
const BREAK = /[/?=&.\-_ ]/;

// Where the tail starts in `text` (0: all of it).
export function tailStart(text: string) {
  const slash = text.lastIndexOf('/');
  if (slash > 0 && text.length - slash <= SEGMENT) return slash;
  const at = text.length - END;
  if (at <= 0) return 0;
  for (let start = at; start > 0 && start >= text.length - SEGMENT; start--)
    if (BREAK.test(text[start - 1]!)) return start;
  return at;
}

// Whether a part of a row is cut short: a text cut at its end, or one cut in the middle (its head,
// or in less room than its tail, its tail).
export const isCut = (element: HTMLElement) =>
  [element, ...element.querySelectorAll<HTMLElement>('[data-part]')].some(
    (part) => part.scrollWidth > part.clientWidth,
  );

export function MiddleTruncate({
  text,
  className,
  ...props
}: Omit<ComponentProps<'span'>, 'children'> & { text: string }) {
  useCopyWhole();
  const shown = text.replace(/[ \t\n\r\f]+/g, ' ');
  const at = tailStart(shown);
  return (
    <span
      data-slot="middle-truncate"
      data-full={text}
      className={cn(
        'relative flex min-w-0 overflow-hidden whitespace-pre after:sr-only after:content-[attr(data-full)]',
        className,
      )}
      {...props}
    >
      {at > 0 && (
        <span
          data-part="head"
          aria-hidden="true"
          className="min-w-0 overflow-hidden text-ellipsis whitespace-pre"
        >
          {shown.slice(0, at)}
        </span>
      )}
      <span
        data-part="tail"
        aria-hidden="true"
        dir="rtl"
        className="max-w-full flex-none overflow-hidden text-ellipsis whitespace-pre"
      >
        <span dir="ltr">{shown.slice(at)}</span>
      </span>
    </span>
  );
}

// The copy listener, on the document while any of these is drawn.
let drawn = 0;
function useCopyWhole() {
  useEffect(() => {
    if (drawn++ === 0) document.addEventListener('copy', copyWhole);
    return () => {
      if (--drawn === 0) document.removeEventListener('copy', copyWhole);
    };
  }, []);
}

// A selection that crosses from a head into its tail is copied in stretches cut there, each as
// the browser writes it, put together with nothing between them, as plain text; one that crosses
// none is left to the browser's own copy.
function copyWhole(event: ClipboardEvent) {
  const selection = document.getSelection();
  if (!event.clipboardData || selection?.rangeCount !== 1 || selection.isCollapsed)
    return;
  const range = selection.getRangeAt(0);
  const joins = [...document.querySelectorAll('[data-slot="middle-truncate"]')].flatMap(
    (element) => {
      const head = element.querySelector('[data-part="head"]')?.firstChild;
      const tail = element.querySelector('[data-part="tail"] > span')?.firstChild;
      return head instanceof Text &&
        tail instanceof Text &&
        range.comparePoint(head, head.length) === 0 &&
        range.comparePoint(tail, 0) === 0
        ? [{ head, tail }]
        : [];
    },
  );
  if (!joins.length) return;
  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
  const last: [Node, number] = [range.endContainer, range.endOffset];
  const written = (from: [Node, number], to: [Node, number]) => {
    const stretch = document.createRange();
    stretch.setStart(...from);
    stretch.setEnd(...to);
    selection.removeAllRanges();
    selection.addRange(stretch);
    return selection.toString();
  };
  let text = '';
  let start: [Node, number] = [range.startContainer, range.startOffset];
  for (const { head, tail } of joins) {
    text += written(start, [head, head.length]);
    start = [tail, 0];
  }
  text += written(start, last);
  selection.setBaseAndExtent(anchorNode!, anchorOffset, focusNode!, focusOffset);
  event.clipboardData.setData('text/plain', text);
  event.preventDefault();
}
