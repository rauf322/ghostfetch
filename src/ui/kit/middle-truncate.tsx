// A URL cut short in the middle, so its end stays: "/api/sea…invoices&page=2" rather than
// "/api/search?q=invoices&pa…", as the end is what tells two URLs apart. After T3 Code's (its
// idea; none of its code, which measures where this doesn't). CSS only: the text is split once
// into a head, which gives way with the ellipsis, and a tail, which doesn't (tailStart(),
// src/lib/url-end.ts), side by side in a flex row; no measuring, so a row draws as fast as one
// that cuts at the end.
//
// - Shorter than its tail, a text is all tail: no head, so no empty box beside it.
// - The head keeps room for its ellipsis however narrow the row, so a cut always shows ("/…"):
//   its first character and the ellipsis, as CSS clips a line's first character rather than put
//   the ellipsis in its place (--cut-room: two characters of a monospace font, which every URL
//   line has; an unnamed rule's title, in the text font, sets 2em). A head no longer than that
//   would show whole with the tail cut, so a text with one is all tail. In less room than the
//   head's and the tail, the tail gives way too, at its start, so its very end still shows
//   ("/…ge=2"), and nothing leaves the row: the tail is a right-to-left box, cut at its left,
//   around its text set left to right on its own (dir), which it doesn't change while it has
//   room. It's cut with no ellipsis of its own, the head's saying so, and as wide as a whole
//   number of characters (--cut-step), so none is drawn in part.
// - Where there's no head, the tail cut short shows its own ellipsis, at its start.
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
import { tailStart } from '../../lib/index.ts';
import { cn } from '../cn.ts';

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
  // A head of two characters or fewer would show whole, with the tail cut: all tail, then
  // ("*/invoices/*").
  const start = tailStart(shown);
  const at = start > 2 ? start : 0;
  return (
    <span
      data-slot="middle-truncate"
      data-full={text}
      className={cn(
        'relative flex min-w-0 overflow-hidden whitespace-pre [--cut-room:2ch] [--cut-step:1ch] after:sr-only after:content-[attr(data-full)]',
        className,
      )}
      {...props}
    >
      {at > 0 && (
        <span
          data-part="head"
          aria-hidden="true"
          className="min-w-(--cut-room) overflow-hidden text-ellipsis whitespace-pre"
        >
          {shown.slice(0, at)}
        </span>
      )}
      <span
        data-part="tail"
        aria-hidden="true"
        dir="rtl"
        className={cn(
          'flex-none overflow-hidden whitespace-pre',
          at > 0
            ? 'max-w-[round(down,calc(100%_-_var(--cut-room)),var(--cut-step))] text-clip'
            : 'max-w-full text-ellipsis',
        )}
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
