// One rule's settings, in numbered sections like the site's chapters ("02 — Match requests").
// Every change is saved as you make it (touchRule) and applies to open tabs right away.
import { useEffect, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { CodeEditor } from '../components/code-editor.tsx';
import { BackButton, PaneHead, PaneScroll } from '../components/layout.tsx';
import { Alert } from '../components/ui/alert.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card, CardHint, CardTitle } from '../components/ui/card.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.tsx';
import { Icon } from '../components/ui/icon.tsx';
import { Input } from '../components/ui/input.tsx';
import { FieldLabel } from '../components/ui/label.tsx';
import { Segmented, SegmentedItem } from '../components/ui/segmented.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.tsx';
import { Switch } from '../components/ui/switch.tsx';
import { notify } from '../components/ui/toast.tsx';
import { Toggle } from '../components/ui/toggle.tsx';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group.tsx';
import { download, formatJson, jsonProblem } from '../lib/dom.ts';
import type { CodeEditor as Editor } from '../lib/editor/code-editor.ts';
import { vimPreferred } from '../lib/editor/vim.ts';
import {
  BODY_MODES,
  MATCH_HINTS,
  MATCH_MODES,
  METHODS,
  TYPES,
  normalizeRule,
  ruleTitle,
  testUrl,
} from '../lib/store.ts';
import type {
  BodyMode,
  HeaderRow,
  MatchMode,
  Method,
  Rule,
  RuleType,
} from '../lib/store.ts';
import {
  addRule,
  findRule,
  removeRule,
  state,
  touchRule,
  useUiState,
} from '../lib/state.ts';
import { cn } from '../lib/utils.ts';

const STATUS_PRESETS = [200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500, 503];
// The body mode's text in the rule, and the language it's written in.
const CODE_FIELDS: Partial<
  Record<BodyMode, { field: 'body' | 'merge' | 'script'; language: 'json' | 'js' }>
> = {
  replace: { field: 'body', language: 'json' },
  merge: { field: 'merge', language: 'json' },
  script: { field: 'script', language: 'js' },
};
const CORS_HEADERS: HeaderRow[] = [
  { op: 'set', name: 'Access-Control-Allow-Origin', value: '*' },
  {
    op: 'set',
    name: 'Access-Control-Allow-Methods',
    value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  },
  { op: 'set', name: 'Access-Control-Allow-Headers', value: '*' },
];
const METHOD_ITEMS = METHODS.map((method) => ({
  value: method,
  label: method === 'ANY' ? 'Any method' : method,
}));
const MODE_ITEMS = (Object.entries(MATCH_MODES) as [MatchMode, string][]).map(
  ([value, label]) => ({ value, label: `URL ${label.toLowerCase()}` }),
);
const OP_ITEMS = [
  { value: 'set', label: 'Set' },
  { value: 'remove', label: 'Remove' },
];

interface RuleEditorProps {
  rule: Rule;
  // Put the cursor in the URL field, for a rule that was just created.
  focusUrl: boolean;
  // Moves when the rules were changed in another view, so the body editor starts over from them.
  revision: number;
  onSelect: (id: string | null) => void;
}

export function RuleEditor({ rule, focusUrl, revision, onSelect }: RuleEditorProps) {
  const ui = useUiState();
  const code = useRef<Editor | null>(null);
  const urlField = useRef<HTMLInputElement>(null);
  const [testedUrl, setTestedUrl] = useState('');
  const [vim, setVim] = useState(vimPreferred);
  const { match, response } = rule;

  useEffect(() => {
    if (focusUrl) urlField.current?.focus();
  }, [focusUrl]);

  // Changes go to the stored rule, looked up by its id: an edit made in another view replaces
  // every rule with a new copy.
  function edit(change: (current: Rule) => void) {
    const current = findRule(rule.id);
    if (!current) return;
    change(current);
    touchRule(current);
  }

  function duplicate() {
    const copy = normalizeRule(structuredClone(rule), { newId: true });
    copy.name = `${ruleTitle(rule)} (copy)`;
    addRule(copy, state.rules.indexOf(rule) + 1);
    onSelect(copy.id);
  }

  function remove() {
    const removed = removeRule(rule.id);
    onSelect(null);
    notify(`Deleted “${ruleTitle(rule)}”`, {
      action: 'Undo',
      onAction: () => {
        addRule(removed!.rule, removed!.index);
        onSelect(removed!.rule.id);
      },
    });
  }

  function format() {
    const editor = code.current;
    if (!editor) return;
    const formatted = formatJson(editor.value);
    if (formatted === null)
      return notify("Can't format: the body isn't valid JSON", {
        kind: 'error',
      });
    if (formatted !== editor.value) editor.replace(formatted);
    return undefined;
  }

  function switchVim(on: boolean) {
    setVim(on);
    code.current?.setVim(on);
    // Straight back into the body, where the keys are.
    code.current?.textarea.focus({ preventScroll: true });
  }

  const dnrError = rule.enabled && ui.enabled ? ui.dnrErrors[rule.id] : '';
  const regexProblem = regexError(rule);
  const tested = testedUrl.trim() ? testResult(rule, testedUrl.trim()) : null;
  const body = rule.type === 'response' ? CODE_FIELDS[response.bodyMode] : undefined;
  const status = body ? codeStatus(rule, response[body.field]) : null;
  // The sections are numbered as they come.
  let section = 0;
  const title = (text: ReactNode, note?: ReactNode) => (
    <CardTitle index={++section} note={note}>
      {text}
    </CardTitle>
  );

  return (
    <>
      <PaneHead>
        <BackButton
          title="All rules"
          data-testid="rule-back"
          onClick={() => onSelect(null)}
        />
        <Input
          variant="bare"
          data-testid="rule-name"
          aria-label="Rule name"
          value={rule.name}
          placeholder={match.graphqlOperation || match.url || 'Name this rule'}
          onChange={(event) =>
            edit((current) => {
              current.name = event.target.value;
            })
          }
          className="flex-1 px-3.5 text-title font-medium text-white placeholder:text-t40 hover:bg-hover focus:bg-pressed"
        />
        {/* The rule's own switch fills a cell, so the whole cell is clickable. */}
        <label
          title="Turn this rule on or off"
          className="flex w-14 flex-none cursor-pointer items-center justify-center border-l border-border"
        >
          <Switch
            checked={rule.enabled}
            onCheckedChange={(on) =>
              edit((current) => {
                current.enabled = on;
              })
            }
            className="data-[size=default]:h-[13px] data-[size=default]:w-[25px]"
          />
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                title="More actions"
                data-testid="rule-menu"
                className="h-full w-[45px] border-l border-border"
              />
            }
          >
            <Icon name="more" size={18} />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={duplicate}>
              <Icon name="copy" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                download(
                  `ghostfetch-${slug(ruleTitle(rule))}.json`,
                  JSON.stringify({ ghostfetch: 1, rules: [rule] }, null, 2),
                )
              }
            >
              <Icon name="export" /> Export this rule
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              data-testid="delete-rule"
              onClick={remove}
            >
              <Icon name="close" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PaneHead>

      <PaneScroll>
        {dnrError && (
          <Alert variant="error" data-testid="dnr-error" className="mx-3.5 mt-3.5">
            {`Chrome rejected this rule: ${dnrError}`}
          </Alert>
        )}

        <Card>
          {title('Rule type')}
          <Segmented
            aria-label="Rule type"
            value={rule.type}
            onValueChange={(type) =>
              edit((current) => {
                current.type = type as RuleType;
              })
            }
          >
            {(Object.keys(TYPES) as RuleType[]).map((type) => (
              <SegmentedItem key={type} value={type} title={TYPES[type].desc}>
                {TYPES[type].short}
              </SegmentedItem>
            ))}
          </Segmented>
          {/* Each sentence is one run of text, as before, so the browser lays it out the same. */}
          <CardHint>
            {rule.type === 'response' ? (
              <>
                {`${TYPES.response.desc}. Applies to `}
                <code>fetch()</code> and <code>XMLHttpRequest</code> calls made by the
                page.
              </>
            ) : (
              `${TYPES[rule.type].desc}.`
            )}
          </CardHint>
        </Card>

        <Card>
          {title('Match requests')}
          <div className="flex gap-2">
            <Select
              items={METHOD_ITEMS}
              value={match.method}
              onValueChange={(method) =>
                edit((current) => {
                  current.match.method = method as Method;
                })
              }
            >
              <SelectTrigger title="HTTP method" className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHOD_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={MODE_ITEMS}
              value={match.mode}
              onValueChange={(mode) =>
                edit((current) => {
                  current.match.mode = mode as MatchMode;
                })
              }
            >
              <SelectTrigger title="How the URL is compared" className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            ref={urlField}
            data-testid="match-url"
            aria-label="URL pattern"
            value={match.url}
            placeholder="/api/users"
            onChange={(event) =>
              edit((current) => {
                current.match.url = event.target.value;
              })
            }
          />
          <CardHint tone={regexProblem ? 'bad' : 'default'}>
            {regexProblem || MATCH_HINTS[match.mode]}
          </CardHint>
          {rule.type === 'response' && (
            <label className="flex min-w-0 flex-col gap-[5px]">
              <FieldLabel>
                GraphQL operation{' '}
                <em className="tracking-mono text-t30 not-italic normal-case">
                  optional
                </em>
              </FieldLabel>
              <Input
                value={match.graphqlOperation}
                placeholder="GetUser"
                onChange={(event) =>
                  edit((current) => {
                    current.match.graphqlOperation = event.target.value;
                  })
                }
              />
            </label>
          )}
          <div className="flex items-center gap-2.5">
            <Input
              size="sm"
              data-testid="tester"
              aria-label="Test URL"
              placeholder="Paste a URL to test the pattern"
              value={testedUrl}
              onChange={(event) => setTestedUrl(event.target.value)}
              className="flex-1"
            />
            {tested && (
              <Verdict
                tone={tested.tone}
                data-testid="tester-result"
                className="max-w-[50%] flex-none text-foreground"
              >
                {tested.text}
              </Verdict>
            )}
          </div>
        </Card>

        {rule.type === 'response' && (
          <>
            <Card>
              {title('Response body')}
              <Segmented
                aria-label="Response body"
                value={response.bodyMode}
                onValueChange={(mode) =>
                  edit((current) => {
                    current.response.bodyMode = mode as BodyMode;
                  })
                }
              >
                {(Object.keys(BODY_MODES) as BodyMode[]).map((mode) => (
                  <SegmentedItem key={mode} value={mode} title={BODY_MODES[mode].desc}>
                    {BODY_MODES[mode].short || BODY_MODES[mode].label}
                  </SegmentedItem>
                ))}
              </Segmented>
              <CardHint>{BODY_MODES[response.bodyMode].desc}</CardHint>
              {body && (
                <>
                  <CodeEditor
                    key={`${body.field}:${revision}`}
                    ref={code}
                    value={response[body.field]}
                    language={body.language}
                    onChange={(text) =>
                      edit((current) => {
                        current.response[body.field] = text;
                      })
                    }
                  />
                  <div className="flex min-h-[26px] items-center justify-between gap-2">
                    <Verdict
                      tone={status?.tone}
                      data-testid="code-status"
                      className={status?.tone === 'bad' ? 'text-foreground' : 'text-t40'}
                    >
                      {status?.text}
                    </Verdict>
                    <span className="ml-auto flex items-center gap-1.5">
                      <Toggle
                        data-testid="vim"
                        pressed={vim}
                        onPressedChange={switchVim}
                        title="Vim keys in the body editor"
                        className="border-input"
                      >
                        Vim
                      </Toggle>
                      {response.bodyMode !== 'script' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid="format"
                          onClick={format}
                          className="border-input"
                        >
                          Format
                        </Button>
                      )}
                    </span>
                  </div>
                </>
              )}
            </Card>

            <Card>
              {title('Status, delay and headers')}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
                <label className="flex min-w-0 flex-col gap-[5px]">
                  <FieldLabel>Status code</FieldLabel>
                  <Input
                    type="number"
                    min={200}
                    max={599}
                    value={response.status}
                    placeholder={
                      response.bodyMode === 'replace' ? '200' : 'Keep original'
                    }
                    onChange={(event) =>
                      edit((current) => {
                        current.response.status = event.target.value;
                      })
                    }
                    className="tabular-nums"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-[5px]">
                  <FieldLabel>Delay (ms)</FieldLabel>
                  {/* Whole milliseconds, never below 0: the field shows what's kept. */}
                  <Input
                    type="number"
                    min={0}
                    step={250}
                    value={response.delay || ''}
                    placeholder="0"
                    onChange={(event) =>
                      edit((current) => {
                        current.response.delay = Math.max(
                          0,
                          Math.round(Number(event.target.value) || 0),
                        );
                      })
                    }
                    className="tabular-nums"
                  />
                </label>
                {response.bodyMode === 'replace' && (
                  <label className="col-span-2 flex min-w-0 flex-col gap-[5px]">
                    <FieldLabel>Content-Type</FieldLabel>
                    <Input
                      list="content-types"
                      value={response.contentType}
                      onChange={(event) =>
                        edit((current) => {
                          current.response.contentType = event.target.value;
                        })
                      }
                    />
                  </label>
                )}
              </div>
              {/* Click the chosen code again to clear it. */}
              <ToggleGroup
                aria-label="Status code"
                value={[response.status]}
                onValueChange={(values) =>
                  edit((current) => {
                    current.response.status = (values as string[])[0] ?? '';
                  })
                }
                className="grid grid-cols-6 border-0 border-t border-l"
              >
                {STATUS_PRESETS.map((preset) => (
                  <ToggleGroupItem
                    key={preset}
                    value={String(preset)}
                    data-testid={`status-${preset}`}
                    className="h-[26px] border-r border-b border-input px-0 text-meta normal-case tracking-[inherit] not-first:border-l-0"
                  >
                    {preset}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldLabel className="mt-1.5 block">Response headers</FieldLabel>
              <HeaderRows
                rows={response.headers}
                pick={(current) => current.response.headers}
                edit={edit}
              />
            </Card>
          </>
        )}

        {rule.type === 'redirect' && (
          <Card>
            {title('Redirect to')}
            <Input
              data-testid="redirect-to"
              value={rule.redirect.to}
              placeholder="http://localhost:3000/api/users"
              onChange={(event) =>
                edit((current) => {
                  current.redirect.to = event.target.value;
                })
              }
            />
            <CardHint>
              A full URL, including <code>http://</code> or <code>https://</code>. With{' '}
              <b>URL regex</b> you can reuse capture groups: match{' '}
              <code>{'^https://api\\.example\\.com/(.*)'}</code> and redirect to{' '}
              <code>{'http://localhost:4000/\\1'}</code>.
            </CardHint>
          </Card>
        )}

        {rule.type === 'headers' && (
          <>
            <Card>
              {title('Request headers', 'sent to the server')}
              <HeaderRows
                rows={rule.headers.request}
                pick={(current) => current.headers.request}
                edit={edit}
              />
            </Card>
            <Card>
              {title('Response headers', 'seen by the page')}
              <HeaderRows
                rows={rule.headers.response}
                pick={(current) => current.headers.response}
                edit={edit}
              />
              <CardHint>
                {'Fighting CORS against a local backend? '}
                <Button
                  variant="link"
                  size="inline"
                  onClick={() =>
                    edit((current) => {
                      const rows = current.headers.response;
                      for (const header of CORS_HEADERS) {
                        if (
                          !rows.some(
                            (row) => row.name.toLowerCase() === header.name.toLowerCase(),
                          )
                        )
                          rows.push({ ...header });
                      }
                    })
                  }
                >
                  Add CORS headers
                </Button>
                {" (doesn't work for requests that send cookies, because "}
                <code>*</code> isn't allowed with credentials).
              </CardHint>
            </Card>
          </>
        )}

        {rule.type === 'block' && (
          <Card>
            <CardHint>
              Matching requests fail with <code>net::ERR_BLOCKED_BY_CLIENT</code>, as if
              the server were unreachable. Handy for testing offline and error states.
            </CardHint>
          </Card>
        )}
      </PaneScroll>
    </>
  );
}

// Set or remove headers, one row each: the operation, the name and (to set) the value.
function HeaderRows({
  rows,
  pick,
  edit,
}: {
  rows: HeaderRow[];
  pick: (rule: Rule) => HeaderRow[];
  edit: (change: (rule: Rule) => void) => void;
}) {
  const list = useRef<HTMLDivElement>(null);

  function add() {
    // Drawn at once, so the new row's name field is there to take the cursor.
    flushSync(() =>
      edit((rule) => {
        pick(rule).push({ op: 'set', name: '', value: '' });
      }),
    );
    [...list.current!.querySelectorAll<HTMLInputElement>('[data-row-name]')]
      .at(-1)
      ?.focus();
  }

  return (
    <div ref={list} className="flex flex-col items-start gap-1.5">
      {rows.map((row, index) => (
        <div
          key={index}
          className="grid w-full grid-cols-[84px_minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5"
        >
          <Select
            items={OP_ITEMS}
            value={row.op}
            onValueChange={(op) =>
              edit((rule) => {
                pick(rule)[index]!.op = op as HeaderRow['op'];
              })
            }
          >
            <SelectTrigger size="sm" aria-label="Operation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OP_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            size="sm"
            data-row-name
            list="header-names"
            aria-label="Header name"
            placeholder="Header name"
            value={row.name}
            onChange={(event) =>
              edit((rule) => {
                pick(rule)[index]!.name = event.target.value;
              })
            }
            className={cn(row.op === 'remove' && 'col-span-2')}
          />
          {row.op !== 'remove' && (
            <Input
              size="sm"
              aria-label="Header value"
              placeholder="Value"
              value={row.value}
              onChange={(event) =>
                edit((rule) => {
                  pick(rule)[index]!.value = event.target.value;
                })
              }
            />
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            title="Remove header"
            onClick={() =>
              edit((rule) => {
                pick(rule).splice(index, 1);
              })
            }
          >
            <Icon name="close" size={14} />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={add}>
        <Icon name="plus" size={14} /> Add header
      </Button>
    </div>
  );
}

// A check's result, like "Matches" or "Valid JSON": the green square when it passed, a cross when
// it didn't, and neither for a plain note.
function Verdict({
  tone,
  className,
  ...props
}: ComponentProps<'span'> & { tone?: 'good' | 'bad' }) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center gap-[7px] text-meta',
        "data-[tone=good]:text-control data-[tone=good]:text-t80 data-[tone=good]:uppercase data-[tone=good]:tracking-caps data-[tone=good]:before:size-[7px] data-[tone=good]:before:flex-none data-[tone=good]:before:bg-signal data-[tone=good]:before:content-['']",
        "data-[tone=bad]:before:content-['✗']",
        className,
      )}
      {...props}
    />
  );
}

// A regex that doesn't compile, in the browser's words.
function regexError({ match }: Rule) {
  if (match.mode !== 'regex' || !match.url.trim()) return '';
  try {
    new RegExp(match.url.trim());
    return '';
  } catch (error) {
    return (error as Error).message;
  }
}

function testResult(rule: Rule, url: string): { tone: 'good' | 'bad'; text: string } {
  try {
    const matched = rule.match.url.trim()
      ? testUrl(rule, url)
      : Boolean(rule.match.graphqlOperation.trim());
    if (!matched) return { tone: 'bad', text: 'No match' };
    return {
      tone: 'good',
      text: rule.match.graphqlOperation.trim()
        ? 'URL matches (operation is checked at runtime)'
        : 'Matches',
    };
  } catch (error) {
    return { tone: 'bad', text: (error as Error).message };
  }
}

// What the line under the body says: whether the JSON is valid, or how a script is used.
function codeStatus(
  rule: Rule,
  text: string,
): { tone?: 'good' | 'bad'; text: string } | null {
  const mode = rule.response.bodyMode;
  if (mode === 'script')
    return {
      text: 'Runs in the page. Return the value the app should receive.',
    };
  if (mode === 'replace' && !/json/i.test(rule.response.contentType)) return null;
  let problem = jsonProblem(text);
  if (!problem && mode === 'merge' && !/^\s*\{/.test(text))
    problem = 'Merge JSON should be an object, e.g. { "role": "admin" }';
  return { tone: problem ? 'bad' : 'good', text: problem || 'Valid JSON' };
}

function slug(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'rule'
  );
}
