// Ghostfetch's icons as React elements: the same 24×24 shapes as shared/lib/icons.ts (which the
// body editor's find bar draws from HTML strings), stroked with currentColor. test/kit.mjs checks
// that the two draw the same.
import type { SVGProps } from 'react';
import { cn } from '../cn.ts';

const SHAPES = {
  back: <path d="M15 18l-6-6 6-6" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a1 1 0 0 1 1-1h10" />
    </>
  ),
  external: (
    <path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
  ),
  clear: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M6.5 17.5l11-11" />
    </>
  ),
  reload: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  wand: (
    <>
      <path d="M15 4V2M15 10V8M11 6h2M17 6h2M4 20L14 10" />
      <path d="M19 13v2M18 14h2M8 3v2M7 4h2" />
    </>
  ),
  rule: <path d="M4 6h16M4 12h10M4 18h7" />,
  import: <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />,
  export: <path d="M12 15V3M7 8l5-5 5 5M5 21h14" />,
  tab: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="6" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="18" r="1" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  forward: <path d="M9 18l6-6-6-6" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  swap: <path d="M8 3L4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4" />,
  braces: (
    <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
  ),
  hash: <path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" />,
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2M10 2h4" />
    </>
  ),
  list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
};

export type IconName = keyof typeof SHAPES;
export const ICON_NAMES = Object.keys(SHAPES) as IconName[];

export function Icon({
  name,
  size = 16,
  className,
  ...props
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      data-slot="icon"
      data-icon={name}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('flex-none', className)}
      {...props}
    >
      {SHAPES[name]}
    </svg>
  );
}
