import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import type { AnimationEvent } from 'react';
import { cn } from '../cn.ts';

// A switch that's just a dot, for something live: green and pulsing while on (after T3 Code's
// "working" dot), green and still while on but `paused`, grey while off. A hairline ring around
// the dot on hover says it's a control; the hit area is 24 px, or whatever className makes it.
// The dot is 6 px, as T3 Code's
// beside "Working" is, and sits on whole pixels, 9 px in. Unlike T3 Code's (motion-safe), it
// pulses with reduced motion too: the pulse is a fade, with nothing moving, which is what Reduce
// Motion swaps movement for, and without it a rule that's on wouldn't look live there.
export function SignalSwitch({
  className,
  paused = false,
  ...props
}: SwitchPrimitive.Root.Props & { paused?: boolean }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-paused={paused || undefined}
      className={cn(
        'group/signal relative inline-flex size-6 shrink-0 items-center justify-center data-disabled:cursor-default data-disabled:opacity-45',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        onAnimationStart={inStep}
        className={cn(
          'pointer-events-none block size-1.5 rounded-full bg-t30 outline-offset-[3px] outline-input transition-[background-color] duration-150 group-hover/signal:outline group-data-disabled/signal:outline-0 data-checked:bg-signal',
          !paused && 'data-checked:animate-signal-pulse',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

// Every dot on the page pulses in step, however long ago each was switched on: a CSS
// animation counts from when it started, so each one is moved to count from the page's start.
// Only the pulse: the grey-to-green fade that starts with it is a CSS transition, which moved
// back that far would end at once.
function inStep(event: AnimationEvent<HTMLElement>) {
  for (const animation of event.currentTarget.getAnimations())
    if (animation instanceof CSSAnimation) animation.startTime = 0;
}
