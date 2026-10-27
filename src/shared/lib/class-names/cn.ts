// cn() for the UI kit: joins class names (clsx), and lets a later Tailwind class override an
// earlier one of the same kind (tailwind-merge), so a component's className can restyle it.
import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The kit's own type sizes, letter spacings and shadow (src/app/styles/kit.css). Registered so
// that cn() knows `text-label` is a size, and doesn't drop it next to a colour such as `text-t40`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['micro', 'label', 'control', 'meta', 'small', 'body', 'title', 'hero'],
      tracking: ['normal', 'mono', 'caps', 'wide', 'wider', 'badge', 'label'],
      shadow: ['menu'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
