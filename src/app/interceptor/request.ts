// A request as the page made it, read for the rules and the log: its body as text, its URL made
// absolute, and the error it failed with, in words.
export function describeBody(body: unknown): string {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof FormData) {
    return [...body]
      .map(
        ([key, value]) =>
          `${key}=${typeof value === 'string' ? value : `[file ${value.name}]`}`,
      )
      .join('\n');
  }
  if (body instanceof Blob) return `[Blob, ${body.size} bytes]`;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(body);
    } catch {
      return `[binary, ${body.byteLength} bytes]`;
    }
  }
  if (body instanceof ReadableStream) return '[stream]';
  if (body instanceof Document) return new XMLSerializer().serializeToString(body);
  return String(body);
}

export function absoluteUrl(url: unknown) {
  try {
    return new URL(String(url), document.baseURI).href;
  } catch {
    return String(url);
  }
}

export function errorText(problem: unknown) {
  return (problem as Error | undefined)?.name === 'AbortError'
    ? 'Aborted'
    : String((problem as Error | undefined)?.message || problem);
}
