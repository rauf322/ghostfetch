// A rule's row in the popup: its switch, the green dot, as in the editor's list; its name, with its
// slot at the right (the kit's ItemSlot), which says what the rule did on the tab's page and when,
// "1 mocked · 4m" (the count green while the rule answers there, grey once it, its group or
// Ghostfetch is off; the time grey, from the screens' clock, RuleTime), and under the pointer or
// with focus has its Edit this rule in the same place; and what it matches under its name, after
// its group's name where the row isn't set in under the group, cut in its middle where it's long,
// so the URL's end stays. Where the line is short of room (Commit Mono, Larger) the slot gives way,
// the time first, then the count, as the name keeps 7 letters' room.
//
// A click on the row opens the rule in the editor, as its Edit this rule does; its dot turns it on
// or off, saved at once, as the popup can close at any moment. `stepsBack`: a rule that's on but
// hasn't answered on the page steps back, its name quieter, as in the editor's list. In the list's
// tree (rule-list.tsx) the row is an item that takes focus, checked while its switch is on, named
// by the rule's name and described by whether it's off (its group's off, too), what it did and what
// it matches; its dot is never a Tab stop, its Edit this rule only while the row is the list's Tab
// stop.
import { memo, useId, useRef, useState } from 'react';
import {
  isAnswering,
  ruleTitle,
  wouldAnswer,
} from '../../../bounded-contexts/rules/index.ts';
import type { Rule } from '../../../bounded-contexts/rules/index.ts';
import { RuleSwitch } from '../../../bounded-contexts/rules/ui/rule-switch.tsx';
import { RuleTime } from '../../../bounded-contexts/rules/ui/rule-time.tsx';
import { openRuleInEditor } from '../../../platform/index.ts';
import { cn } from '../../../ui/cn.ts';
import { Icon } from '../../../ui/kit/icon.tsx';
import {
  Item,
  ItemAction,
  ItemContent,
  ItemDescription,
  ItemSlot,
  ItemTitle,
} from '../../../ui/kit/item.tsx';
import { MiddleTruncate } from '../../../ui/kit/middle-truncate.tsx';
import { TooltipTrigger } from '../../../ui/kit/tooltip.tsx';
import { matchLine } from '../lib/rule-words.ts';
import { useRowTools } from './row-tools.ts';

// Its props are the rule and values (memo() compares them as they are): the rule is changed in
// place, so its revision (ruleRevision()) is what moves when it's edited.
export const RuleRow = memo(function RuleRow({
  rule,
  groupName,
  groupOff,
  level,
  inGroup,
  did,
  last,
  stepsBack,
  enabled,
  windowId,
  tabbable,
  position,
  count,
}: {
  rule: Rule;
  revision: number;
  // Its group's name, said before what it matches ('' where it's in none, or set in under it).
  groupName: string;
  // The name of its group while that's off, or ''.
  groupOff: string;
  // In the tree: at its top (1), or under a group or the fold (2).
  level: 1 | 2;
  // Set in under its group's row.
  inGroup: boolean;
  // What it did on the page, in words ('' for nothing, or while that isn't known).
  did: string;
  // When it last answered there (ms since 1970, 0 for never).
  last: number;
  stepsBack: boolean;
  // Ghostfetch is on (not paused).
  enabled: boolean;
  windowId: number;
  // The list's Tab stop: the one row the keyboard enters the list at, whose action is a Tab stop.
  tabbable: boolean;
  // Where it stands among the rows at its level, from 1.
  position: number;
  count: number;
}) {
  const tools = useRowTools();
  // Its action is the shared tooltip's trigger once the pointer or focus has come near the row, or
  // the row is the list's Tab stop: a plain button until then, so a long list mounts quickly.
  // Told once: a state set again to what it is can still draw the row.
  const [near, setNear] = useState(false);
  const told = useRef(false);
  const approach = () => {
    if (told.current) return;
    told.current = true;
    setNear(true);
  };
  const ids = useId();
  const off = !wouldAnswer(rule, !groupOff);
  const answering = isAnswering(rule, !groupOff, !enabled);
  const title = ruleTitle(rule);
  return (
    <Item
      variant="rule"
      data-testid="popup-rule"
      data-item={rule.id}
      // What the rule matches, for the tests to find it by.
      data-url={rule.match.url}
      off={off}
      role="treeitem"
      aria-level={level}
      aria-posinset={position}
      aria-setsize={count}
      // Its switch, which Space turns: said as it changes.
      aria-checked={rule.enabled}
      aria-labelledby={`${ids}name`}
      aria-describedby={`${ids}off ${ids}did ${ids}match`}
      tabIndex={tabbable ? 0 : -1}
      // Flush with the card, as dense as the popup's rows were; the dot lines up with the label
      // over the rules, and, set in, with its group's name.
      className={cn('mx-0 py-[7px]', inGroup && 'pl-[26px]')}
      onPointerEnter={approach}
      onFocus={approach}
    >
      <RuleSwitch
        rule={rule}
        groupOff={groupOff}
        immediate
        tip={tools.dot}
        tabIndex={-1}
        className="-my-0.5 -ml-[9px] self-start"
      />
      <ItemContent>
        <div className="flex min-w-0 items-center gap-2">
          <ItemTitle
            id={`${ids}name`}
            quiet={stepsBack && !off && !did}
            className="min-w-[min(7em,60%)] flex-1"
          >
            {title}
          </ItemTitle>
          <ItemSlot
            statusId={`${ids}did`}
            // Room for its one action.
            className="min-w-6"
            actions={
              <EditAction
                rule={rule}
                title={title}
                live={near || tabbable}
                tabbable={tabbable}
                windowId={windowId}
              />
            }
          >
            {did && (
              <>
                <span
                  data-testid="rule-did"
                  className={answering ? 'text-signal' : 'text-t50'}
                >
                  {did}
                </span>{' '}
                {last > 0 && <RuleTime last={last} />}
              </>
            )}
          </ItemSlot>
        </div>
        <ItemDescription id={`${ids}match`} className="gap-1.5">
          {groupName && (
            <span
              data-testid="rule-group"
              className="max-w-[45%] flex-none truncate text-t65"
            >
              {groupName}
            </span>
          )}
          <MiddleTruncate text={matchLine(rule)} className="font-mono" />
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
});

// The slot's action: open the rule in the editor (the side panel, or Firefox's sidebar), as a
// click on the row does. A plain button until the row is `live`, then the shared tooltip's trigger.
function EditAction({
  rule,
  title,
  live,
  tabbable,
  windowId,
}: {
  rule: Rule;
  title: string;
  live: boolean;
  tabbable: boolean;
  windowId: number;
}) {
  const tools = useRowTools();
  const button = (
    <ItemAction
      data-testid="edit-rule"
      aria-label={`Edit this rule: “${title}”`}
      tabIndex={tabbable ? 0 : -1}
      onClick={() => openRuleInEditor(rule.id, windowId)}
    >
      <Icon name="edit" size={14} />
    </ItemAction>
  );
  return live ? (
    <TooltipTrigger handle={tools.edit} label="Edit this rule">
      {button}
    </TooltipTrigger>
  ) : (
    button
  );
}
