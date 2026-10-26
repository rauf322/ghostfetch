// Rules tab: the rule list and the rule editor. In a narrow side panel only one of the
// two is visible at a time; from 760px wide they sit side by side.
import { useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  DetailPane,
  List,
  ListEmpty,
  ListPane,
  PaneFooter,
  PaneToolbar,
  SearchField,
  SectionRow,
  Split,
} from '../components/layout.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.tsx';
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '../components/ui/empty.tsx';
import { Icon } from '../components/ui/icon.tsx';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemNumber,
  ItemTitle,
} from '../components/ui/item.tsx';
import { Label } from '../components/ui/label.tsx';
import { Switch } from '../components/ui/switch.tsx';
import { BODY_MODES, TYPES, createRule, ruleTitle } from '../lib/store.ts';
import type { Rule, RuleType } from '../lib/store.ts';
import {
  addRule,
  findRule,
  moveRule,
  subscribe,
  touchRule,
  useUiState,
} from '../lib/state.ts';
import { cn } from '../lib/utils.ts';
import { RuleEditor } from './rule-editor.tsx';

interface RulesViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onImport: () => void;
  onExport: () => void;
}

// A rule being dragged to a new place, and where it would land.
interface Drag {
  id: string;
  over: string | null;
  after: boolean;
}

// The line where a dragged rule would land, above or below the rule under the pointer.
const DROP_MARK = cn(
  "data-[drop=before]:before:absolute data-[drop=before]:before:inset-x-0 data-[drop=before]:before:-top-px data-[drop=before]:before:h-0.5 data-[drop=before]:before:bg-foreground data-[drop=before]:before:content-['']",
  "data-[drop=after]:after:absolute data-[drop=after]:after:inset-x-0 data-[drop=after]:after:-bottom-px data-[drop=after]:after:h-0.5 data-[drop=after]:after:bg-foreground data-[drop=after]:after:content-['']",
);

export function RulesView({ selectedId, onSelect, onImport, onExport }: RulesViewProps) {
  const { rules, dnrErrors } = useUiState();
  const [query, setQuery] = useState('');
  // A rule that was just created, whose URL field gets the cursor.
  const [created, setCreated] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // Counts the times the rules were changed in another view (the popup, another window) while the
  // editor didn't have focus. The body editor keeps its own text, so it starts over from the new
  // copy then; with focus in the editor, what you're typing stays.
  const [revision, setRevision] = useState(0);
  const editorPane = useRef<HTMLElement>(null);
  // The New rule menu hangs from the toolbar cell around its button, like the other menus.
  const newRuleCell = useRef<HTMLDivElement>(null);
  const selected = findRule(selectedId);

  useEffect(
    () =>
      subscribe((kind) => {
        if (kind === 'rules' && !editorPane.current?.contains(document.activeElement))
          setRevision((count) => count + 1);
      }),
    [],
  );

  function select(id: string | null) {
    setCreated(null);
    onSelect(id);
  }

  function createOfType(type: RuleType) {
    setQuery('');
    const rule = addRule(createRule(type), 0);
    onSelect(rule.id);
    setCreated(rule.id);
  }

  const term = query.trim().toLowerCase();
  const visible = rules.filter(
    (rule) =>
      !term ||
      [
        ruleTitle(rule),
        rule.match.url,
        rule.match.graphqlOperation,
        TYPES[rule.type].label,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term),
  );
  const active = rules.filter((rule) => rule.enabled).length;

  return (
    <Split>
      <ListPane picked={Boolean(selected)}>
        <PaneToolbar>
          <SearchField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search rules"
            aria-label="Search rules"
          />
          <div ref={newRuleCell} className="flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="primary" data-testid="new-rule" className="mr-2 h-7" />
                }
              >
                <Icon name="plus" size={14} />
                New rule
              </DropdownMenuTrigger>
              <DropdownMenuContent anchor={newRuleCell} className="w-[320px]">
                {(Object.keys(TYPES) as RuleType[]).map((type) => (
                  <DropdownMenuItem
                    key={type}
                    data-testid={`new-${type}`}
                    onClick={() => createOfType(type)}
                    className="items-start gap-3 border-input px-3 py-[11px] text-foreground data-highlighted:text-foreground"
                  >
                    <TypeOption type={type} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </PaneToolbar>
        <SectionRow>
          <Label>Rules</Label>
          <Label className="tracking-wider">
            {rules.length ? `${active} / ${rules.length} on` : ''}
          </Label>
        </SectionRow>

        <List>
          {!rules.length && (
            // In a narrow panel, where the editor's own empty state is hidden.
            <ListEmpty className="wide:hidden">
              <p>
                <strong>No rules yet.</strong> Pick what you want to do:
              </p>
              <TypeCards onPick={createOfType} />
              <p className="text-meta leading-[1.55] text-t40">
                Or open <b>Traffic</b>, click a request and choose{' '}
                <b>Mock this response</b>.
              </p>
            </ListEmpty>
          )}
          {Boolean(rules.length) && !visible.length && (
            <ListEmpty>
              <p>{`No rules match “${query}”.`}</p>
            </ListEmpty>
          )}
          {visible.map((rule) => {
            // The number is the rule's place in the whole list, which is its priority, even while a
            // search hides some rules.
            const position = String(rules.indexOf(rule) + 1).padStart(2, '0');
            // An unnamed rule already shows its URL as the title.
            const pattern = rule.name.trim()
              ? [rule.match.url, rule.match.graphqlOperation].filter(Boolean).join(' ')
              : '';
            const error = dnrErrors[rule.id];
            return (
              <Item
                key={rule.id}
                variant="rule"
                data-testid="rule"
                selected={rule.id === selectedId}
                off={!rule.enabled}
                title={rule.match.url}
                draggable
                data-drop={
                  drag?.over === rule.id ? (drag.after ? 'after' : 'before') : undefined
                }
                className={cn(DROP_MARK, drag?.id === rule.id && 'opacity-40')}
                onClick={() => select(rule.id)}
                // Drag to reorder: response rules are tried top to bottom and the first match wins.
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', rule.id);
                  setDrag({ id: rule.id, over: null, after: false });
                }}
                onDragOver={(event) => {
                  if (!drag) return;
                  event.preventDefault();
                  const box = event.currentTarget.getBoundingClientRect();
                  const after = event.clientY > box.top + box.height / 2;
                  const over = rule.id === drag.id ? null : rule.id;
                  if (over !== drag.over || after !== drag.after)
                    setDrag({ ...drag, over, after });
                }}
                onDrop={(event) => {
                  if (!drag || rule.id === drag.id) return;
                  event.preventDefault();
                  const index = rules.indexOf(rule);
                  moveRule(drag.id, drag.after ? index + 1 : index);
                }}
                onDragEnd={() => setDrag(null)}
              >
                <ItemNumber>{position}</ItemNumber>
                <ItemContent>
                  <ItemTitle>{ruleTitle(rule)}</ItemTitle>
                  <ItemDescription>
                    <Badge>{TYPES[rule.type].short}</Badge>
                    {rule.match.method !== 'ANY' && (
                      <span className="flex-none text-control font-medium tracking-[0.04em] text-t80">
                        {rule.match.method}
                      </span>
                    )}
                    {pattern && (
                      <span className="max-w-[62%] flex-none truncate text-t65">
                        {pattern}
                      </span>
                    )}
                    {/* the summary gives way before the URL does */}
                    <span className="min-w-0 flex-[0_10_auto] truncate text-t30">
                      {summary(rule)}
                    </span>
                  </ItemDescription>
                </ItemContent>
                {error && (
                  <span title={error} className="size-2 flex-none bg-foreground" />
                )}
                {/* A click on the switch, or on its hidden input, doesn't open the rule. */}
                <span className="contents" onClick={(event) => event.stopPropagation()}>
                  <Switch
                    size="sm"
                    checked={rule.enabled}
                    title={`Turn this rule ${rule.enabled ? 'off' : 'on'}`}
                    onCheckedChange={(on) => {
                      rule.enabled = on;
                      touchRule(rule);
                    }}
                  />
                </span>
              </Item>
            );
          })}
        </List>

        <PaneFooter>
          <span className="flex min-w-0 flex-1 items-center gap-[7px] overflow-hidden px-3.5 text-label whitespace-nowrap uppercase tracking-caps text-t30">
            <Icon name="grip" size={13} />
            Drag to reorder
          </span>
          <Button variant="cell" size="cell" onClick={onImport}>
            Import
          </Button>
          <Button variant="cell" size="cell" onClick={onExport}>
            Export
          </Button>
        </PaneFooter>
      </ListPane>

      <DetailPane ref={editorPane} picked={Boolean(selected)}>
        {selected ? (
          <RuleEditor
            key={selected.id}
            rule={selected}
            focusUrl={created === selected.id}
            revision={revision}
            onSelect={select}
          />
        ) : (
          <Empty>
            <EmptyMedia>
              <img src="/icons/icon128.png" width={56} height={56} alt="" />
            </EmptyMedia>
            <EmptyTitle>
              {rules.length ? 'Select a rule to edit it' : 'Create your first rule'}
            </EmptyTitle>
            <EmptyDescription>
              Rules apply on every site Ghostfetch runs on while it's switched on. The
              quickest start: open <b>Traffic</b>, click a request and choose{' '}
              <b>Mock this response</b>.
            </EmptyDescription>
            <TypeCards onPick={createOfType} />
          </Empty>
        )}
      </DetailPane>
    </Split>
  );
}

// A rule type: its badge, its name and what it does. In the New rule menu and on the type cards.
function TypeOption({ type }: { type: RuleType }) {
  const { short, label, desc } = TYPES[type];
  return (
    <>
      <Badge className="mt-0.5 min-w-[78px] text-t65">{short}</Badge>
      <span className="flex min-w-0 flex-col gap-0.5">
        <b className="font-medium">{label}</b>
        <small className="text-meta leading-[1.45] text-t40">{desc}</small>
      </span>
    </>
  );
}

// The four rule types as a column of buttons, where there are no rules (yet) to show.
function TypeCards({
  onPick,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'onClick'> & {
  onPick: (type: RuleType) => void;
}) {
  return (
    <div className={cn('grid border border-input text-left', className)} {...props}>
      {(Object.keys(TYPES) as RuleType[]).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onPick(type)}
          className="flex w-full items-start gap-3 border-b border-input px-3 py-[11px] text-left text-foreground last:border-b-0 hover:bg-pressed"
        >
          <TypeOption type={type} />
        </button>
      ))}
    </div>
  );
}

function summary(rule: Rule) {
  if (rule.type === 'redirect') return `→ ${rule.redirect.to || 'no destination yet'}`;
  if (rule.type === 'block') return 'Requests fail';
  if (rule.type === 'headers') {
    const count = rule.headers.request.length + rule.headers.response.length;
    return `${count} header${count === 1 ? '' : 's'}`;
  }
  const { bodyMode, status, delay } = rule.response;
  return [BODY_MODES[bodyMode].label, status, delay ? `${delay} ms` : '']
    .filter(Boolean)
    .join(' · ');
}
