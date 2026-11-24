// The order, without a browser: every operation of src/bounded-contexts/rules/domain/order.ts, on
// an order of ungrouped rules and groups. What's kept of an order, and the order laid out from
// that again; where a rule is, and the place for one to be tried nth; rules put, taken out and
// moved, down their own list, into a group, out of one and between two; groups added, deleted and
// put back, moved, turned off and taken away; and the order's own rule, that no two groups share a
// name: a rename to a name that's taken is refused, and a group that comes in under one gets the
// next free one. Each operation changes the order it's given in place, and a rule or a group stays
// the object it was, which is what the screens tell it by.
//
//   node test/order.mjs      (npm test runs it after test/matching.mjs)
import { createGroup, createRule } from '../src/bounded-contexts/rules/index.ts';
import {
  addEntries,
  addGroup,
  groupIndex,
  groupsIn,
  layOut,
  moveGroup,
  moveGroupTo,
  moveRule,
  moveRuleTo,
  placeAt,
  placeOf,
  put,
  removeGroup,
  renameGroup,
  rulesIn,
  storedGroups,
  take,
  turnGroup,
  ungroup,
} from '../src/bounded-contexts/rules/domain/order.ts';
import { check, expect, finish } from './fixtures.mjs';

// A rule with an id, in a group or none.
const rule = (id, group = '') => ({ ...createRule(), id, group });
// A group as it's kept: with an id, a name and its place among the top-level entries.
const group = (id, name, at) => ({ ...createGroup(name), id, at });

// The order each check starts from: a, the group PR-1 with b and c, d, the group PR-2 with e, and
// the group Empty with no rules. The rules are tried a, b, c, d, e.
const sample = () =>
  layOut(
    [rule('a'), rule('b', 'g1'), rule('c', 'g1'), rule('d'), rule('e', 'g2')],
    [group('g1', 'PR-1', 1), group('g2', 'PR-2', 3), group('g3', 'Empty', 4)],
  );
const START = 'a, PR-1[b c], d, PR-2[e], Empty[]';

// An order as its top-level entries: a rule's id, or a group's name with its rules' ids.
const line = (order) =>
  order
    .map((entry) =>
      entry.kind === 'rule'
        ? entry.rule.id
        : `${entry.group.name}[${entry.rules.map((each) => each.id).join(' ')}]`,
    )
    .join(', ');
// The rules as they're tried, each with the group it says it's in.
const said = (order) =>
  rulesIn(order)
    .map((each) => (each.group ? `${each.id}:${each.group}` : each.id))
    .join(' ');

await check(
  "what's kept of an order is its rules from the top, each saying which group it's in, and its groups, each a copy with its place, which the order's own groups don't have; laid out from those again, in whatever order the groups are kept, it's the order it was, and a rule whose group isn't there is ungrouped and told so",
  () => {
    const order = sample();
    const stray = rule('s', 'gone');
    const again = layOut(
      [...structuredClone(rulesIn(order)), stray],
      storedGroups(order).toReversed(),
    );
    expect(
      [
        line(order),
        said(order),
        groupsIn(order).map((each) => each.name),
        storedGroups(order).map((each) => [each.id, each.name, each.at]),
        groupsIn(order).some((each) => 'at' in each),
        line(again),
        stray.group,
      ],
      [
        START,
        'a b:g1 c:g1 d e:g2',
        ['PR-1', 'PR-2', 'Empty'],
        [
          ['g1', 'PR-1', 1],
          ['g2', 'PR-2', 3],
          ['g3', 'Empty', 4],
        ],
        false,
        `${START}, s`,
        '',
      ],
    );
  },
);

await check(
  "where a rule is: in its group, at its index there, or in none, at its index among the top-level entries; and where a group stands among those; nowhere, for one that isn't there",
  () => {
    const order = sample();
    expect(
      [
        placeOf(order, 'a'),
        placeOf(order, 'c'),
        placeOf(order, 'd'),
        placeOf(order, 'e'),
        placeOf(order, 'gone'),
        groupIndex(order, 'g1'),
        groupIndex(order, 'g3'),
        groupIndex(order, 'gone'),
      ],
      [
        { group: '', index: 0 },
        { group: 'g1', index: 1 },
        { group: '', index: 2 },
        { group: 'g2', index: 0 },
        null,
        1,
        4,
        -1,
      ],
    );
  },
);

await check(
  "the place for a rule to be tried nth: ungrouped, before the top-level entry that falls there, so never inside a group, or at the end of the list when none does; in a group, as near to nth as the group's block allows, a whole index whatever it's asked",
  () => {
    const order = sample();
    const ungrouped = [-3, 0, 1, 2, 3, 4, 5, 6, 99].map(
      (position) => placeAt(order, position).index,
    );
    const inGroup = [
      placeAt(order, 0, 'g1'),
      placeAt(order, 2, 'g1'),
      placeAt(order, 99, 'g1'),
      placeAt(order, 4, 'g2'),
      placeAt(order, 5, 'g2'),
      placeAt(order, 0, 'g3'),
      // A group that isn't there: as for no group.
      placeAt(order, 2, 'gone'),
    ];
    expect(
      [ungrouped, inGroup, placeAt(order, 2.9, 'g1'), placeAt(order, Number.NaN, 'g1')],
      [
        [0, 0, 1, 1, 2, 3, 4, 5, 5],
        [
          { group: 'g1', index: 0 },
          { group: 'g1', index: 1 },
          { group: 'g1', index: 2 },
          { group: 'g2', index: 0 },
          { group: 'g2', index: 1 },
          { group: 'g3', index: 0 },
          { group: '', index: 1 },
        ],
        { group: 'g1', index: 1 },
        { group: 'g1', index: 0 },
      ],
    );
  },
);

await check(
  "rules put at a place stand there in the order they're given, each told which group it's in now; an index past the end is the end, and one before the top the top; a group that isn't there puts them at the top of the list, ungrouped",
  () => {
    const order = sample();
    put(order, [rule('x'), rule('y')], { group: 'g1', index: 1 });
    put(order, [rule('z', 'g1')], { group: '', index: 99 });
    put(order, [rule('w', 'g2')], { group: 'gone', index: 3 });
    put(order, [rule('v')], { group: 'g1', index: -2 });
    expect(
      [line(order), said(order)],
      [
        'w, a, PR-1[v b x y c], d, PR-2[e], Empty[], z',
        'w a v:g1 b:g1 x:g1 y:g1 c:g1 d e:g2 z',
      ],
    );
  },
);

await check(
  "a rule taken out of the order says where it was, and put back there the order is as it was; one that isn't there, nothing",
  () => {
    const order = sample();
    const c = take(order, 'c');
    const a = take(order, 'a');
    const without = line(order);
    const missing = take(order, 'gone');
    put(order, [a.rule], a.place);
    put(order, [c.rule], c.place);
    expect(
      [[c.rule.id, c.place], [a.rule.id, a.place], without, missing, line(order)],
      [
        ['c', { group: 'g1', index: 1 }],
        ['a', { group: '', index: 0 }],
        'PR-1[b], d, PR-2[e], Empty[]',
        null,
        START,
      ],
    );
  },
);

await check(
  "a rule moved goes before what's at the index given, as the order stood with the rule still in it, the way a drag sees it: down its own list, into a group, out of one, and to where it is already; a rule that isn't there moves nothing",
  () => {
    const order = sample();
    const move = (id, place) => [moveRule(order, id, place), line(order)];
    expect(
      [
        // Before PR-2, which was at 3.
        move('a', { group: '', index: 3 }),
        // After c, the last of PR-1's two.
        move('b', { group: 'g1', index: 2 }),
        move('d', { group: 'g2', index: 0 }),
        move('c', { group: '', index: 0 }),
        move('e', { group: 'g2', index: 1 }),
        move('gone', { group: '', index: 0 }),
        said(order),
      ],
      [
        [true, 'PR-1[b c], d, a, PR-2[e], Empty[]'],
        [true, 'PR-1[c b], d, a, PR-2[e], Empty[]'],
        [true, 'PR-1[c b], a, PR-2[d e], Empty[]'],
        [true, 'c, PR-1[b], a, PR-2[d e], Empty[]'],
        [true, 'c, PR-1[b], a, PR-2[d e], Empty[]'],
        [false, 'c, PR-1[b], a, PR-2[d e], Empty[]'],
        'c b:g1 a d:g2 e:g2',
      ],
    );
  },
);

await check(
  "a rule moved to be tried nth goes to its own group's nth, or as near as the block allows, when no group is given; into the group that is, or out of any, where it's never put inside a group",
  () => {
    const order = sample();
    const move = (...to) => [moveRuleTo(order, ...to), line(order)];
    expect(
      [
        // First of all would be above its group: the top of PR-1 is as near as it gets.
        move('c', 0),
        // Third is above PR-2 once a is out: the top of PR-2.
        move('a', 2, 'g2'),
        // Second falls inside PR-1: out of any group, it goes before PR-1.
        move('e', 1, ''),
        move('d', 99),
        move('gone', 0),
        said(order),
      ],
      [
        [true, 'a, PR-1[c b], d, PR-2[e], Empty[]'],
        [true, 'PR-1[c b], d, PR-2[a e], Empty[]'],
        [true, 'e, PR-1[c b], d, PR-2[a], Empty[]'],
        [true, 'e, PR-1[c b], PR-2[a], Empty[], d'],
        [false, 'e, PR-1[c b], PR-2[a], Empty[], d'],
        'e c:g1 b:g1 a:g2 d',
      ],
    );
  },
);

await check(
  "a group moved goes with its rules: before what's at the index given as the order stood with it still there (a drag), or to the index it has once it's there (the agent's position), the end for one past it; a group that isn't there moves nothing",
  () => {
    const order = sample();
    const drag = (id, index) => [moveGroup(order, id, index), line(order)];
    const moveTo = (id, index) => [moveGroupTo(order, id, index), line(order)];
    expect(
      [
        // Before PR-2, which was at 3.
        drag('g1', 3),
        drag('g3', 0),
        // Before what's after it: where it is.
        drag('g1', 4),
        moveTo('g2', 1),
        moveTo('g3', 99),
        drag('gone', 0),
        moveTo('gone', 0),
        said(order),
      ],
      [
        [true, 'a, d, PR-1[b c], PR-2[e], Empty[]'],
        [true, 'Empty[], a, d, PR-1[b c], PR-2[e]'],
        [true, 'Empty[], a, d, PR-1[b c], PR-2[e]'],
        [true, 'Empty[], PR-2[e], a, d, PR-1[b c]'],
        [true, 'PR-2[e], a, d, PR-1[b c], Empty[]'],
        [false, 'PR-2[e], a, d, PR-1[b c], Empty[]'],
        [false, 'PR-2[e], a, d, PR-1[b c], Empty[]'],
        'e:g2 a d b:g1 c:g1',
      ],
    );
  },
);

await check(
  'a group comes in at the index given, the top if none is, with the rules given, each told it is in it; under a name another group has, in any case, it gets the next free one in brackets',
  () => {
    const order = sample();
    const made = { ...createGroup('Checkout'), id: 'g4' };
    const added = addGroup(order, made, 1, [rule('x'), rule('y', 'g1')]);
    addGroup(order, { ...createGroup('pr-1'), id: 'g5' });
    addGroup(order, { ...createGroup('PR-1'), id: 'g6' }, 99);
    expect(
      [added === made, line(order), said(order)],
      [
        true,
        'pr-1 (2)[], a, Checkout[x y], PR-1[b c], d, PR-2[e], Empty[], PR-1 (3)[]',
        'a x:g4 y:g4 b:g1 c:g1 d e:g2',
      ],
    );
  },
);

await check(
  'a group deleted goes with its rules and says where it was; put back there, it is the group it was with the rules it had, under another name if a group made meanwhile has its own',
  () => {
    const order = sample();
    const removed = removeGroup(order, 'g1');
    const without = [line(order), said(order)];
    addGroup(order, { ...createGroup('PR-1'), id: 'g4' }, 4);
    addGroup(order, removed.group, removed.index, removed.rules);
    expect(
      [
        [removed.group.id, removed.rules.map((each) => each.id), removed.index],
        without,
        removeGroup(order, 'gone'),
        line(order),
        groupsIn(order)[0] === removed.group,
        said(order),
      ],
      [
        ['g1', ['b', 'c'], 1],
        ['a, d, PR-2[e], Empty[]', 'a d e:g2'],
        null,
        'a, PR-1 (2)[b c], d, PR-2[e], Empty[], PR-1[]',
        true,
        'a b:g1 c:g1 d e:g2',
      ],
    );
  },
);

await check(
  "a group taken away leaves its rules where it was, ungrouped, and one with no rules nothing; a group that isn't there takes nothing away",
  () => {
    const order = sample();
    const done = [ungroup(order, 'g1'), ungroup(order, 'g3'), ungroup(order, 'gone')];
    expect(
      [done, line(order), said(order)],
      [[true, true, false], 'a, b, c, d, PR-2[e]', 'a b c d e:g2'],
    );
  },
);

await check(
  "entries from a rules file go to the top in the file's order; a group among them whose name is taken, by a group in the order or by one before it in the file, gets the next free one in brackets",
  () => {
    const order = sample();
    addEntries(
      order,
      layOut(
        [rule('m'), rule('n', 'f1'), rule('o', 'f2')],
        [group('f1', 'PR-1', 0), group('f2', 'pr-1', 2), group('f3', 'Fresh', 3)],
      ),
    );
    expect(line(order), `PR-1 (2)[n], m, pr-1 (3)[o], Fresh[], ${START}`);
  },
);

await check(
  "a group is renamed to a name no other has, or to its own in another case; the order refuses a name another group has, in any case, and one with nothing in it, and says which; a group that has the name already is left as it is, and one that isn't there has none to take",
  () => {
    const order = sample();
    const [pr1] = groupsIn(order);
    // What a rename said, the group's name after it, and whether it left its mark on the group:
    // its updatedAt moved on.
    const rename = (name) => {
      pr1.updatedAt = 0;
      return [renameGroup(order, 'g1', name), pr1.name, pr1.updatedAt > 0];
    };
    expect(
      [
        rename('Checkout'),
        rename('Checkout'),
        rename('CHECKOUT'),
        rename('pr-2'),
        rename('Empty'),
        rename(''),
        rename('  '),
        renameGroup(order, 'gone', 'Fresh'),
        groupsIn(order).map((each) => each.name),
      ],
      [
        ['renamed', 'Checkout', true],
        ['same', 'Checkout', false],
        ['renamed', 'CHECKOUT', true],
        ['taken', 'CHECKOUT', false],
        ['taken', 'CHECKOUT', false],
        ['empty', 'CHECKOUT', false],
        ['empty', 'CHECKOUT', false],
        'gone',
        ['CHECKOUT', 'PR-2', 'Empty'],
      ],
    );
  },
);

await check(
  "a group turned off and on again leaves its rules' own switches as they were; a group that isn't there is turned neither way",
  () => {
    const order = sample();
    const [pr1] = groupsIn(order);
    const [, b, c] = rulesIn(order);
    b.enabled = false;
    pr1.updatedAt = 0;
    const off = [turnGroup(order, 'g1', false), pr1.enabled, b.enabled, c.enabled];
    const stamped = pr1.updatedAt > 0;
    const on = [turnGroup(order, 'g1', true), pr1.enabled, b.enabled, c.enabled];
    expect(
      [off, stamped, on, turnGroup(order, 'gone', false)],
      [[true, false, false, true], true, [true, true, false, true], false],
    );
  },
);

await check(
  'through every operation a rule and a group stay the objects they were, changed in place, and so does the order',
  () => {
    const order = sample();
    const rules = new Map(rulesIn(order).map((each) => [each.id, each]));
    const groups = new Map(groupsIn(order).map((each) => [each.id, each]));
    moveRule(order, 'a', { group: 'g1', index: 1 });
    moveRuleTo(order, 'e', 0);
    moveRuleTo(order, 'b', 3, '');
    moveGroup(order, 'g2', 0);
    moveGroupTo(order, 'g1', 2);
    renameGroup(order, 'g1', 'Renamed');
    turnGroup(order, 'g2', false);
    const taken = take(order, 'c');
    put(order, [taken.rule], { group: 'g3', index: 0 });
    const removed = removeGroup(order, 'g1');
    addGroup(order, removed.group, removed.index, removed.rules);
    ungroup(order, 'g2');
    addEntries(order, []);
    expect(
      [
        line(order),
        rulesIn(order).every((each) => rules.get(each.id) === each),
        groupsIn(order).every((each) => groups.get(each.id) === each),
        rulesIn(order).length,
      ],
      ['e, d, Renamed[a], b, Empty[c]', true, true, 5],
    );
  },
);

finish();
