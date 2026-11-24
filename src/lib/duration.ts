// A span of milliseconds as the screens show one: "600 ms" under a second, "1 s" or "1.5 s" from
// there on. A rule's delay, how long a request took, and the delays New rule offers all read
// this way.
export function formatDuration(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${Number((ms / 1000).toFixed(2))} s`;
}
