// A random id, a version 4 UUID: crypto.randomUUID()'s where the browser offers it, and otherwise
// one made the same way from crypto.getRandomValues(). randomUUID() is only there in a secure
// context, and the page's bridge rebuilds the stored rules and groups in pages that aren't one:
// those served over plain http from a host that isn't localhost, as a local.* host or a site you
// add can be. getRandomValues() is there in every context.
export function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // What makes it a version 4 UUID (RFC 9562): 4 in the high half of its seventh byte, and the
  // two highest bits of its ninth set to 10.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
