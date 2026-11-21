// Whether a rule answers (docs/glossary/rules.md, Answering). A rule has three switches over it:
// its own, its group's if it's in one, and Ghostfetch's. These are plain functions of the three,
// with no store behind them, so the background and the page's bridge, which read the rules as
// they're stored, ask what the screens ask.
import type { Rule } from './types.ts';

// On, and in no group or a group that's on (`groupOn`): all that a rule and its group have to say.
// Such a rule answers unless Ghostfetch is paused. It's what the page is given and what the
// agent's try_url goes by, each of which says apart whether Ghostfetch is paused.
export function wouldAnswer(rule: Pick<Rule, 'enabled'>, groupOn: boolean) {
  return rule.enabled && groupOn;
}

// Answering: on, in no group or a group that's on, while Ghostfetch isn't paused. Only an
// answering rule answers the requests it matches; one that's on but not answering is waiting for
// its group, or for Ghostfetch.
export function isAnswering(
  rule: Pick<Rule, 'enabled'>,
  groupOn: boolean,
  paused: boolean,
) {
  return wouldAnswer(rule, groupOn) && !paused;
}
