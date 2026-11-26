// Where a URL cut short in its middle keeps its end (src/ui/kit/middle-truncate.tsx draws it): the
// end is what tells two URLs apart, and it stays whole while the start gives way.
//
// - The last segment of its path (up to a "?" or "#") with a letter or a digit in it, from its
//   slash, with what follows it: "/invoices/", "/invoices/*", "/42/", "/user?id=7". A segment
//   that's empty, or only "*", never stands alone: "/api/invoices/42/" keeps "/42/", not "/".
// - Where that's longer than 16 characters, the last 10, moved back to start after a break ("/",
//   "?", "=", "&", ".", "-", "_" or a space) within the last 16: "invoices&page=2",
//   "return_to=/". A text that short is all end.
// - A character of two code units (an emoji) is never split between the two parts.
const SEGMENT = 16;
const END = 10;
const BREAK = /[/?=&.\-_ ]/;
const WORDY = /[\p{L}\p{N}]/u;

// Its length in characters, an emoji one.
const characters = (text: string) => [...text].length;

// Where the end starts in `text` (0: all of it).
export function tailStart(text: string) {
  const path = text.search(/[?#]/);
  for (
    let slash = text.lastIndexOf('/', path === -1 ? undefined : path - 1);
    slash > 0;
    slash = text.lastIndexOf('/', slash - 1)
  ) {
    const next = text.indexOf('/', slash + 1);
    const ends = [next, path].filter((at) => at > slash);
    const segment = text.slice(slash + 1, ends.length ? Math.min(...ends) : undefined);
    if (!WORDY.test(segment)) continue;
    if (characters(text.slice(slash)) <= SEGMENT) return slash;
    break;
  }
  let at = text.length - END;
  if (at <= 0) return 0;
  for (let start = at; start > 0 && start >= text.length - SEGMENT; start--)
    if (BREAK.test(text[start - 1]!)) return start;
  // Not between the two halves of an emoji.
  if (/[\uDC00-\uDFFF]/.test(text[at]!) && /[\uD800-\uDBFF]/.test(text[at - 1]!)) at -= 1;
  return at;
}
