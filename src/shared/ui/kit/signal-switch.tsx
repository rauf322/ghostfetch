import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import type { AnimationEvent } from 'react';
import { cn } from '../cn.ts';

// A switch that's just a dot, for something live: green and pulsing while on (after T3 Code's
// "working" dot), green and still while on but `paused`, grey while off. The kit's one round
// thing: the other green marks are squares. A hairline ring around the dot on hover says it's a
// control; the hit area is 24 px, or whatever className makes it. The dot is 10 px, so it weighs
// about what the 8 px squares do and sits on whole pixels in the middle. It pulses with reduced
// motion too, as T3 Code's dot does: the pulse is a fade, with nothing moving, and fades are what
// Reduce Motion swaps movement for.
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
          'pointer-events-none block size-2.5 rounded-full bg-t30 outline-offset-[3px] outline-input transition-[background-color] duration-150 group-hover/signal:outline group-data-disabled/signal:outline-0 data-checked:bg-signal',
          !paused && 'data-checked:animate-signal-pulse',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

// Every dot on the page pulses in step, however long ago each was switched on: a CSS
// animation counts from when it started, so each one is moved to count from the page's start.
function inStep(event: AnimationEvent<HTMLElement>) {
  for (const animation of event.currentTarget.getAnimations()) animation.startTime = 0;
}
