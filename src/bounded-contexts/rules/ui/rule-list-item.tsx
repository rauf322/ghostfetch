// One rule in the list: its switch (the green dot), its name, with its slot at the right (what it
// did on the page the editor watches and when, "1 mocked · 4m", or under the pointer its actions),
// and what it matches and does. Its place in the list is its priority. Click it to open it, or its
// dot to turn it on or off without opening it; drag it to reorder, or into a group or out of one.
// A rule that's on but hasn't answered on the page steps back, its name quieter. A rule in a group
// stands under the group's header, set in; while the group is off, it fades as a rule that's off
// does, as it doesn't answer, and its dot stays as its own switch is. A URL the row has no room for
// is cut in its middle, so its end stays; under the pointer, a name or URL the row cuts short shows
// whole in a tooltip.
import { memo } from 'react';
import type { PointerEvent } from 'react';
import { timeAgo } from '../../../lib/index.ts';
import { editRule, pausedStore, ruleTitle, wouldAnswer } from '../index.ts';
import type { Rule } from '../index.ts';
import {
  countRule,
  countWords,
  lastAnswered,
  recordingStore,
} from '../../traffic/index.ts';
import type { TrafficLog } from '../../traffic/index.ts';
import { useStore } from '../../../ui/use-store.ts';
import { useNowValue } from '../../../ui/use-now.ts';
import { useTrafficValue } from '../../traffic/ui/index.ts';
import { cn } from '../../../ui/cn.ts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../../../ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../ui/kit/icon.tsx';
import {
  Item,
  ItemAction,
  ItemContent,
  ItemDescription,
  ItemSlot,
  ItemTitle,
} from '../../../ui/kit/item.tsx';
import { MiddleTruncate, isCut } from '../../../ui/kit/middle-truncate.tsx';
import { Tooltip } from '../../../ui/kit/tooltip.tsx';
import { RuleSwitch } from './rule-switch.tsx';
import { ruleSummary } from './rule-summary.ts';
import { RuleMenuItems } from './rule-editor/rule-menu.tsx';
import type { RowDrag } from './use-rule-drag.ts';
import { DROP_MARK, GROUPED_DROP_MARK } from './drop-marks.ts';

interface RuleListItemProps {
  rule: Rule;
  // The rule's revision (ruleRevision()): the rule is changed in place, so this is what moves.
  revision: number;
  selected: boolean;
  drag: RowDrag;
  // In a group: set in under its header.
  inGroup: boolean;
  // The name of the rule's group while that's off, or ''.
  groupOff: string;
  // The editor's log of the page it watches, for what the rule did there.
  log: TrafficLog;
  // Open a rule (the row's, or its copy); null closes the open one (the row's, deleted).
  onSelect: (id: string | null) => void;
}

// Whether a row would draw the same: its rule unchanged (the same copy at the same revision), as
// selected as it was, in the same group in the same state, and where it stands in a drag too.
// Its first line draws again by itself as the rule answers on the page, and as Ghostfetch or
// recording is turned on or off (RuleLine), its time as the clock moves (RuleTime), and its
// switch as Ghostfetch is turned on or off (RuleSwitch).
function drawsTheSame(before: RuleListItemProps, after: RuleListItemProps) {
  return (
    before.rule === after.rule &&
    before.revision === after.revision &&
    before.selected === after.selected &&
    before.inGroup === after.inGroup &&
    before.groupOff === after.groupOff &&
    before.drag.drop === after.drag.drop &&
    before.drag.dragging === after.drag.dragging &&
    before.drag.handlers === after.drag.handlers &&
    before.log === after.log &&
    before.onSelect === after.onSelect
  );
}

// Memoized: the list draws again on every change to any rule (a keystroke in one's body), and a
// row only when its own rule changed.
export const RuleListItem = memo(function RuleListItem({
  rule,
  selected,
  drag,
  inGroup,
  groupOff,
  log,
  onSelect,
}: RuleListItemProps) {
  // An unnamed rule already shows its URL as the title.
  const pattern = rule.name.trim()
    ? [rule.match.url, rule.match.graphqlOperation].filter(Boolean).join(' ')
    : '';
  return (
    <Item
      variant="rule"
      data-testid="rule"
      // What the rule matches, for the tests to find it by.
      data-url={rule.match.url}
      data-group-off={groupOff ? '' : undefined}
      selected={selected}
      off={!wouldAnswer(rule, !groupOff)}
      draggable
      data-drop={drag.drop}
      // Set in under its group's header: its dot under the group's name, and a line where a drop
      // would land set in with it.
      className={cn(
        inGroup ? GROUPED_DROP_MARK : DROP_MARK,
        inGroup && 'pl-[26px]',
        drag.dragging && 'opacity-40',
      )}
      // A click on one of the row's own controls (its switch, or the hidden checkbox Base UI clicks
      // for it, and the actions in its slot) is theirs, and so is one in the ⋯ menu it opened,
      // which React passes up to the row from the menu's portal, outside it: neither opens the
      // rule.
      onClick={(event) => {
        const target = event.target as Element;
        if (
          event.currentTarget.contains(target) &&
          !target.closest('[data-slot="switch"], input, button')
        )
          onSelect(rule.id);
      }}
      onPointerEnter={tipWhenCut}
      {...drag.handlers}
    >
      {/* The dot lines up with the row's text, 12 px in, and with the name's line. */}
      <RuleSwitch
        rule={rule}
        groupOff={groupOff}
        className="-my-0.5 -ml-[9px] self-start"
      />
      <ItemContent>
        <RuleLine
          rule={rule}
          selected={selected}
          groupOff={groupOff}
          log={log}
          onSelect={onSelect}
        />
        <ItemDescription>
          {rule.match.method !== 'ANY' && (
            <span className="flex-none font-mono font-medium text-t80">
              {rule.match.method}
            </span>
          )}
          {pattern && (
            <MiddleTruncate
              text={pattern}
              className="max-w-[62%] flex-none font-mono text-t65"
            />
          )}
          {/* the summary gives way before the URL does, which then gives way in its middle */}
          <span className="min-w-0 flex-[0_10_auto] truncate text-t40">
            {ruleSummary(rule)}
          </span>
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}, drawsTheSame);

// The row's tooltip, set as the pointer comes: the name or the URL in full, only where the row
// cuts it short (data-full holds it whole; a URL is cut in its middle, which isCut() reads). A row
// that shows both whole has none, so there's no tooltip saying again what it says.
function tipWhenCut(event: PointerEvent<HTMLElement>) {
  const row = event.currentTarget;
  const cut = [...row.querySelectorAll<HTMLElement>('[data-full]')]
    .filter(isCut)
    .map((part) => part.dataset.full);
  if (cut.length) row.title = cut.join('\n');
  else row.removeAttribute('title');
}

// The row's first line: the rule's name, which keeps at least a few letters, and its slot at the
// end. In the slot, what the rule did on the page and when ("1 mocked · 4m"), while it's on (in a
// group that's on) and Ghostfetch is recording: the count in green, or grey while Ghostfetch is
// paused, the time in grey; nothing for a rule that hasn't answered there, or is off (its dot says
// so). A rule that's on but hasn't answered steps back, unless it's the open one; while recording
// is off, which rules answered isn't known, so none does. This line draws again by itself when
// Ghostfetch or recording is turned on or off and when the rule answers on the page, so the row
// doesn't have to.
function RuleLine({
  rule,
  selected,
  groupOff,
  log,
  onSelect,
}: {
  rule: Rule;
  selected: boolean;
  groupOff: string;
  log: TrafficLog;
  onSelect: (id: string | null) => void;
}) {
  const { paused } = useStore(pausedStore);
  const { recording } = useStore(recordingStore);
  const did = useTrafficValue(log, (traffic) =>
    countWords(countRule(traffic.entries, rule.id)),
  );
  const last = useTrafficValue(log, (traffic) => lastAnswered(traffic.entries, rule.id));
  const title = ruleTitle(rule);
  const live = rule.enabled && !groupOff && recording;
  const quiet = live && !did && !selected;
  // Its name keeps 7 letters' room, or 60% of the line where that's less.
  const name = 'min-w-[min(7em,60%)] flex-1';
  return (
    <div className="flex min-w-0 items-center gap-2">
      {rule.name.trim() ? (
        <ItemTitle quiet={quiet} className={name} data-full={title}>
          {title}
        </ItemTitle>
      ) : (
        // An unnamed rule's title is its URL (or its GraphQL operation), cut in its middle.
        <ItemTitle quiet={quiet} className={name}>
          <MiddleTruncate text={title} />
        </ItemTitle>
      )}
      <ItemSlot
        actions={<RuleActions rule={rule} selected={selected} onSelect={onSelect} />}
      >
        {live && did && (
          <>
            <span
              data-testid="rule-signal"
              className={!paused ? 'text-signal' : 'text-t50'}
            >
              {did}
            </span>{' '}
            <RuleTime last={last} />
          </>
        )}
      </ItemSlot>
    </div>
  );
}

// When the rule last answered ("· now", "· 4m"), from the screens' clock: it draws again by itself
// only when those words change, at most once a minute, and nothing else of the row does.
function RuleTime({ last }: { last: number }) {
  const ago = useNowValue((now) => timeAgo(now - last));
  return (
    <span data-testid="rule-time" className="text-t50">
      {`· ${ago}`}
    </span>
  );
}

// The slot's actions: turn the rule on or off, as its dot does, and the ⋯ menu the open rule has
// in its header, with the same items.
function RuleActions({
  rule,
  selected,
  onSelect,
}: {
  rule: Rule;
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  const title = ruleTitle(rule);
  const turn = rule.enabled ? 'Turn off' : 'Turn on';
  return (
    <>
      <Tooltip label={turn}>
        <ItemAction
          data-testid="row-switch"
          aria-label={`${turn} “${title}”`}
          onClick={() =>
            editRule(rule.id, (current) => {
              current.enabled = !current.enabled;
            })
          }
        >
          <Icon name="power" size={14} />
        </ItemAction>
      </Tooltip>
      <DropdownMenu>
        <Tooltip label="More actions">
          <DropdownMenuTrigger
            render={
              <ItemAction
                data-testid="row-menu"
                aria-label={`More actions for “${title}”`}
              />
            }
          >
            <Icon name="more" size={15} />
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent>
          <RuleMenuItems rule={rule} open={selected} onSelect={onSelect} />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
