// Short times and the screens' clock, without a browser. timeAgo() (src/lib/time-ago.ts), what a
// rule's row in the editor's list says of when the rule last answered on the page ("1 mocked ·
// 4m"): "now" under a minute, then whole minutes, hours and days, rounded down, at each step's
// edges; a time a little ahead of the clock is "now". createClock() (src/lib/clock.ts), which the
// rows and Traffic's list read the time from, with the timers and the time faked: one timer
// however many listen, stopped with the last of them gone, and what it says between two ticks.
//
//   node test/time.mjs      (npm test runs it after test/curl.mjs)
import { createClock, timeAgo } from '../src/lib/index.ts';
import { check, expect, finish } from './fixtures.mjs';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

await check('under a minute is "now", a time ahead of the clock too', () => {
  expect([0, 1, 30 * SECOND, MINUTE - 1, -5 * SECOND, -HOUR].map(timeAgo), [
    'now',
    'now',
    'now',
    'now',
    'now',
    'now',
  ]);
});

await check('minutes, rounded down, from one to 59', () => {
  expect(
    [MINUTE, MINUTE + 59 * SECOND, 4 * MINUTE + 30 * SECOND, HOUR - 1].map(timeAgo),
    ['1m', '1m', '4m', '59m'],
  );
});

await check('hours, rounded down, from one to 23', () => {
  expect([HOUR, 2 * HOUR + 59 * MINUTE, DAY - 1].map(timeAgo), ['1h', '2h', '23h']);
});

await check('days, rounded down, from one on', () => {
  expect([DAY, 3 * DAY + 23 * HOUR, 400 * DAY].map(timeAgo), ['1d', '3d', '400d']);
});

// setInterval, clearInterval and Date.now faked for `run`: the timers running, by id, with their
// periods; tick(ms) moves the time on and runs each of them once.
async function faked(run) {
  const real = { setInterval, clearInterval, now: Date.now };
  const timers = new Map();
  let ids = 0;
  const fake = {
    time: 1_000_000,
    timers,
    tick(ms) {
      fake.time += ms;
      for (const { each } of timers.values()) each();
    },
  };
  globalThis.setInterval = (each, every) => {
    timers.set(++ids, { each, every });
    return ids;
  };
  globalThis.clearInterval = (id) => timers.delete(id);
  Date.now = () => fake.time;
  try {
    await run(fake);
  } finally {
    globalThis.setInterval = real.setInterval;
    globalThis.clearInterval = real.clearInterval;
    Date.now = real.now;
  }
}

await check(
  'the clock: one timer for a hundred listeners, each told at every tick; stopped with the last one gone, and started again by the next',
  () =>
    faked((fake) => {
      const clock = createClock(15 * SECOND);
      const told = Array.from({ length: 100 }, () => 0);
      const leave = told.map((_, n) => clock.subscribe(() => (told[n] += 1)));
      const periods = [...fake.timers.values()].map(({ every }) => every);
      fake.tick(15 * SECOND);
      fake.tick(15 * SECOND);
      for (const each of leave.slice(1)) each();
      const oneLeft = fake.timers.size;
      leave[0]();
      const none = fake.timers.size;
      const again = clock.subscribe(() => {});
      const restarted = fake.timers.size;
      again();
      expect(
        [
          periods,
          told.every((count) => count === 2),
          oneLeft,
          none,
          restarted,
          fake.timers.size,
        ],
        [[15 * SECOND], true, 1, 0, 1, 0],
      );
    }),
);

await check(
  'the clock says the same between two ticks, and the time at each; asked once it has been stopped a tick or more, the time now',
  () =>
    faked((fake) => {
      const clock = createClock(15 * SECOND);
      const start = fake.time;
      const first = clock.now();
      const leave = clock.subscribe(() => {});
      fake.time += 10 * SECOND;
      const between = [clock.now(), clock.now()];
      fake.tick(5 * SECOND);
      const ticked = clock.now();
      leave();
      fake.time += 40 * SECOND;
      const later = clock.now();
      expect(
        [first, between, ticked, later],
        [start, [start, start], start + 15 * SECOND, start + 55 * SECOND],
      );
    }),
);

finish();
