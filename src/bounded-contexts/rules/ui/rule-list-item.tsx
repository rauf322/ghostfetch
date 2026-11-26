// One rule in the list: its switch (the green dot), its name, with its slot at the right (what it
// did on the page the editor watches and when, "1 mocked · 4m", or under the pointer its actions),
// and what it matches and does. Its place in the list is its priority. Click it to open it, or its
// dot to turn it on or off without opening it; drag it to reorder, or into a group or out of one.
// A rule that's on but hasn't answered on the page steps back, its name quieter. A rule in a group
// stands under the group's header, set in; while the group is off, it fades as a rule that's off
// does, as it doesn't answer, and its dot stays as its own switch is. A URL the row has no room for
// is cut in its middle, so its end stays; under the pointer, a name or URL the row cuts short shows
// whole in a tooltip.
//
// In the list's tree (rule-list.tsx) the row is an item that takes focus, by the list's keys, with
// its name for its own and what it did, what it matches and does, and whether it's off as its
// description. F2 makes its name a field. Its dot is never a Tab stop, its actions only while the
// row is the list's Tab stop (Turn off does from the keyboard what the dot does).
import { memo, useEffect, useId, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
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
import { useTrafficValue } from '../../traffic/ui/index.ts';
import { cn } from '../../../ui/cn.ts';
import { DropdownMenuTrigger } from '../../../ui/kit/dropdown-menu.tsx';
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
import { TooltipTrigger } from '../../../ui/kit/tooltip.tsx';
import { RuleSwitch } from './rule-switch.tsx';
import { ruleSummary } from './rule-summary.ts';
import { RenameField } from './rename-field.tsx';
import { useRowTools } from './row-tools.ts';
import { RuleTime } from './rule-time.tsx';
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
  // The list's Tab stop: the one row the keyboard enters the list at, whose actions are Tab stops.
  tabbable: boolean;
  // Its name is a field, to type a new one in (F2).
  renaming: boolean;
  // Where it stands among the rows at its level (in its group, or at the list's top), from 1.
  position: number;
  count: number;
  // Open a rule (the row's, or its copy); null closes the open one (the row's, deleted).
  onSelect: (id: string | null) => void;
  // Done renaming it: by Enter or Esc (byKey), or by leaving the field.
  onRenamed: (id: string, byKey: boolean) => void;
}

// Whether a row would draw the same: its rule unchanged (the same copy at the same revision), as
// selected as it was, in the same group in the same state, where it stands in a drag and in the
// tree, and as it was for the keyboard. Its first line draws again by itself as the rule answers
// on the page, and as Ghostfetch or recording is turned on or off (RuleLine), its time as the
// clock moves (RuleTime), and its switch as Ghostfetch is turned on or off (RuleSwitch).
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
    before.tabbable === after.tabbable &&
    before.renaming === after.renaming &&
    before.position === after.position &&
    before.count === after.count &&
    before.onSelect === after.onSelect &&
    before.onRenamed === after.onRenamed
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
  tabbable,
  renaming,
  position,
  count,
  onSelect,
  onRenamed,
}: RuleListItemProps) {
  const tools = useRowTools();
  // Its actions are the shared tooltips' and menu's triggers (row-tools.ts) once the pointer or
  // focus has come near the row, or the row is the list's Tab stop: plain buttons until then, so a
  // long list mounts quickly. Told once: a state set again to what it is can still draw the row.
  const [near, setNear] = useState(false);
  const told = useRef(false);
  const approach = () => {
    if (told.current) return;
    told.current = true;
    setNear(true);
  };
  const ids = useId();
  const off = !wouldAnswer(rule, !groupOff);
  // An unnamed rule already shows its URL as the title.
  const pattern = rule.name.trim()
    ? [rule.match.url, rule.match.graphqlOperation].filter(Boolean).join(' ')
    : '';
  return (
    <Item
      variant="rule"
      data-testid="rule"
      data-item={rule.id}
      data-kind="rule"
      // What the rule matches, for the tests to find it by.
      data-url={rule.match.url}
      data-group-off={groupOff ? '' : undefined}
      selected={selected}
      off={off}
      role="treeitem"
      aria-level={inGroup ? 2 : 1}
      aria-posinset={position}
      aria-setsize={count}
      aria-selected={selected || undefined}
      aria-labelledby={`${ids}name`}
      aria-describedby={`${ids}off ${ids}did ${ids}match`}
      tabIndex={tabbable ? 0 : -1}
      draggable={!renaming}
      data-drop={drag.drop}
      // Set in under its group's header: its dot under the group's name, and a line where a drop
      // would land set in with it.
      className={cn(
        inGroup ? GROUPED_DROP_MARK : DROP_MARK,
        inGroup && 'pl-[26px]',
        drag.dragging && 'opacity-40',
      )}
      // A click on one of the row's own controls (its switch, or the hidden checkbox Base UI clicks
      // for it, the actions in its slot, the field its name is while it's renamed) is theirs, and so
      // is one in a menu it opened, which React passes up to the row from the menu's portal,
      // outside it: neither opens the rule.
      onClick={(event) => {
        const target = event.target as Element;
        if (
          event.currentTarget.contains(target) &&
          !target.closest('[data-slot="switch"], input, button')
        )
          onSelect(rule.id);
      }}
      onPointerEnter={(event) => {
        tipWhenCut(event);
        approach();
      }}
      onFocus={approach}
      {...drag.handlers}
    >
      {/* The dot lines up with the row's text, 12 px in, and with the name's line. */}
      <RuleSwitch
        rule={rule}
        groupOff={groupOff}
        tip={tools.dot}
        tabIndex={-1}
        className="-my-0.5 -ml-[9px] self-start"
      />
      <ItemContent>
        <RuleLine
          rule={rule}
          selected={selected}
          groupOff={groupOff}
          log={log}
          live={near || tabbable}
          tabbable={tabbable}
          renaming={renaming}
          ids={ids}
          onNear={approach}
          onRenamed={(byKey) => onRenamed(rule.id, byKey)}
        />
        <ItemDescription id={`${ids}match`}>
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
      {/* For a screen reader: that it's off, as the faded row shows. */}
      {off && (
        <span id={`${ids}off`} hidden>
          {rule.enabled ? `Off, as its group ${groupOff} is off.` : 'Off.'}
        </span>
      )}
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

// The row's first line: the rule's name, which keeps at least a few letters, or the field it is
// while it's renamed, and its slot at the end. In the slot, what the rule did on the page and when
// ("1 mocked · 4m"), while it's on (in a group that's on) and Ghostfetch is recording: the count in
// green, or grey while Ghostfetch is paused, the time in grey; nothing for a rule that hasn't
// answered there, or is off (its dot says so). A rule that's on but hasn't answered steps back,
// unless it's the open one; while recording is off, which rules answered isn't known, so none
// does. This line draws again by itself when Ghostfetch or recording is turned on or off and when
// the rule answers on the page, so the row doesn't have to.
function RuleLine({
  rule,
  selected,
  groupOff,
  log,
  live,
  tabbable,
  renaming,
  ids,
  onNear,
  onRenamed,
}: {
  rule: Rule;
  selected: boolean;
  groupOff: string;
  log: TrafficLog;
  live: boolean;
  tabbable: boolean;
  renaming: boolean;
  // The row's prefix for its parts' ids.
  ids: string;
  onNear: () => void;
  onRenamed: (byKey: boolean) => void;
}) {
  const { paused } = useStore(pausedStore);
  const { recording } = useStore(recordingStore);
  const did = useTrafficValue(log, (traffic) =>
    countWords(countRule(traffic.entries, rule.id)),
  );
  const last = useTrafficValue(log, (traffic) => lastAnswered(traffic.entries, rule.id));
  const title = ruleTitle(rule);
  // On, in no group or a group that's on, while Recording: then the slot says what it did, and it
  // steps back if that's nothing. Not Answering (docs/glossary/rules.md), which a pause ends.
  const onWhileRecording = wouldAnswer(rule, !groupOff) && recording;
  const quiet = onWhileRecording && !did && !selected;
  // Its name keeps 7 letters' room, or 60% of the line where that's less.
  const name = 'min-w-[min(7em,60%)] flex-1';
  return (
    <div className="flex min-w-0 items-center gap-2">
      {renaming ? (
        <RenameField
          name={rule.name}
          label="Rule name"
          testId="rule-name-input"
          allowEmpty
          rename={(next) => {
            editRule(rule.id, (current) => {
              current.name = next;
            });
            return true;
          }}
          onDone={onRenamed}
          // The name's own line high, so the row doesn't grow while it's renamed.
          className={cn(name, 'h-[1.5em] font-medium')}
        />
      ) : rule.name.trim() ? (
        <ItemTitle id={`${ids}name`} quiet={quiet} className={name} data-full={title}>
          {title}
        </ItemTitle>
      ) : (
        // An unnamed rule's title is its URL (or its GraphQL operation), cut in its middle: in the
        // text font, whose characters aren't all as wide as one another (middle-truncate.tsx).
        <ItemTitle id={`${ids}name`} quiet={quiet} className={name}>
          <MiddleTruncate text={title} className="[--cut-room:2em] [--cut-step:1px]" />
        </ItemTitle>
      )}
      <ItemSlot
        statusId={`${ids}did`}
        actions={
          <RuleActions rule={rule} live={live} tabbable={tabbable} onNear={onNear} />
        }
      >
        {onWhileRecording && did && (
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

// The slot's actions: turn the rule on or off, as its dot does, and the ⋯ menu the open rule has
// in its header, with the same items (the list's one menu, row-tools.ts). Plain buttons until the
// row is `live`: Turn off works as one; a ⋯ pressed then (by a screen reader, which moves no
// pointer) makes the row live and opens the menu once its trigger is there.
function RuleActions({
  rule,
  live,
  tabbable,
  onNear,
}: {
  rule: Rule;
  live: boolean;
  tabbable: boolean;
  onNear: () => void;
}) {
  const tools = useRowTools();
  const title = ruleTitle(rule);
  const turn = rule.enabled ? 'Turn off' : 'Turn on';
  const tabIndex = tabbable ? 0 : -1;
  const menuId = `row-menu-${rule.id}`;
  const openOnceLive = useRef(false);
  useEffect(() => {
    if (!live || !openOnceLive.current) return;
    openOnceLive.current = false;
    tools.menu.open(menuId);
  }, [live, menuId, tools]);
  const turnButton = (
    <ItemAction
      data-testid="row-switch"
      aria-label={`${turn} “${title}”`}
      tabIndex={tabIndex}
      onClick={() =>
        editRule(rule.id, (current) => {
          current.enabled = !current.enabled;
        })
      }
    >
      <Icon name="power" size={14} />
    </ItemAction>
  );
  const more = <Icon name="more" size={15} />;
  if (!live)
    return (
      <>
        {turnButton}
        <ItemAction
          data-testid="row-menu"
          aria-label={`More actions for “${title}”`}
          aria-haspopup="menu"
          tabIndex={tabIndex}
          onClick={() => {
            openOnceLive.current = true;
            onNear();
          }}
        >
          {more}
        </ItemAction>
      </>
    );
  return (
    <>
      <TooltipTrigger handle={tools.turn} label={turn}>
        {turnButton}
      </TooltipTrigger>
      <TooltipTrigger handle={tools.more} label="More actions">
        <DropdownMenuTrigger
          id={menuId}
          handle={tools.menu}
          payload={rule.id}
          render={
            <ItemAction
              data-testid="row-menu"
              aria-label={`More actions for “${title}”`}
              tabIndex={tabIndex}
            />
          }
        >
          {more}
        </DropdownMenuTrigger>
      </TooltipTrigger>
    </>
  );
}
