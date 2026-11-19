import type { AnimationEvent, ComponentProps } from 'react';
import { cn } from '../cn.ts';

// A dot that says something is live: green and pulsing while `on` (after T3 Code's "working"
// dot), green and still while on but `paused`, grey while off. It only says so (Traffic's
// Recording); a rule's dot, which is its switch, is SignalSwitch. The dot is 6 px, as T3
// Code's beside "Working" is. Unlike T3 Code's (motion-safe), it pulses with reduced motion too:
// the pulse is a fade, with nothing moving, which is what Reduce Motion swaps movement for, and
// without it a rule that's answering wouldn't look live there.
export function SignalDot({
  on,
  paused = false,
  className,
  ...props
}: ComponentProps<'span'> & { on: boolean; paused?: boolean }) {
  return (
    <span
      aria-hidden
      data-slot="signal-dot"
      data-on={on || undefined}
      data-paused={paused || undefined}
      onAnimationStart={inStep}
      className={cn(
        'block size-1.5 flex-none rounded-full transition-[background-color] duration-150',
        on ? 'bg-signal' : 'bg-t30',
        on && !paused && 'animate-signal-pulse',
        className,
      )}
      {...props}
    />
  );
}

// Every dot on the page pulses in step, however long ago each lit up: a CSS animation counts from
// when it started, so each one is moved to count from the page's start. Only the pulse: the
// grey-to-green fade that starts with it is a CSS transition, which moved back that far would end
// at once.
function inStep(event: AnimationEvent<HTMLElement>) {
  for (const animation of event.currentTarget.getAnimations())
    if (animation instanceof CSSAnimation) animation.startTime = 0;
}
