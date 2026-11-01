// "When a request matches": the requests a rule answers. A row each for the URL (how it's compared
// and the pattern), the method and a GraphQL operation; a click opens the row's editor.
import { useEffect, useRef } from 'react';
import {
  MATCH_HINTS,
  MATCH_MODES,
  METHODS,
  editRule,
} from '../../../../shared/api/index.ts';
import type { MatchMode, Method, Rule } from '../../../../shared/api/index.ts';
import { CardHint } from '../../../../shared/ui/kit/card.tsx';
import { Input } from '../../../../shared/ui/kit/input.tsx';
import { Segmented, SegmentedItem } from '../../../../shared/ui/kit/segmented.tsx';
import { regexError } from '../../lib/rule-checks.ts';
import { URL_LABELS } from '../../lib/rule-summary.ts';
import { SettingRow, SettingsCard } from './settings-card.tsx';

export function MatchSettings({
  rule,
  open,
  onOpenChange,
  focusUrl,
}: {
  rule: Rule;
  open: string | null;
  onOpenChange: (id: string | null) => void;
  // Put the cursor in the URL field, for a rule that was just created.
  focusUrl: boolean;
}) {
  const { match } = rule;
  const url = match.url.trim();
  const operation = match.graphqlOperation.trim();
  const problem = regexError(rule);
  const edit = (change: (current: Rule['match']) => void) =>
    editRule(rule.id, (current) => change(current.match));

  return (
    <SettingsCard open={open} onOpenChange={onOpenChange}>
      <SettingRow
        id="url"
        icon="globe"
        label={URL_LABELS[match.mode]}
        value={problem ? "✗ Doesn't compile" : url || 'Not set'}
        code={Boolean(url) && !problem}
        quiet={!url}
      >
        <Segmented
          aria-label="How the URL is compared"
          value={match.mode}
          onValueChange={(mode) =>
            edit((current) => {
              current.mode = mode as MatchMode;
            })
          }
          className="bg-background"
        >
          {(Object.entries(MATCH_MODES) as [MatchMode, string][]).map(([mode, label]) => (
            <SegmentedItem key={mode} value={mode} data-testid={`mode-${mode}`}>
              {label}
            </SegmentedItem>
          ))}
        </Segmented>
        <UrlField
          value={match.url}
          focus={focusUrl}
          onChange={(value) =>
            edit((current) => {
              current.url = value;
            })
          }
        />
        <CardHint tone={problem ? 'bad' : 'default'}>
          {problem || MATCH_HINTS[match.mode]}
        </CardHint>
      </SettingRow>
      <SettingRow
        id="method"
        icon="swap"
        label="Method"
        value={match.method === 'ANY' ? 'Any' : match.method}
        code={match.method !== 'ANY'}
        quiet={match.method === 'ANY'}
      >
        <Segmented
          aria-label="Method"
          value={match.method}
          onValueChange={(method) =>
            edit((current) => {
              current.method = method as Method;
            })
          }
          className="grid grid-cols-4 bg-background"
        >
          {METHODS.map((method) => (
            <SegmentedItem
              key={method}
              value={method}
              data-testid={`method-${method}`}
              className={method === 'ANY' ? undefined : 'font-mono text-meta'}
            >
              {method === 'ANY' ? 'Any' : method}
            </SegmentedItem>
          ))}
        </Segmented>
      </SettingRow>
      <SettingRow
        id="graphql"
        icon="braces"
        label="GraphQL operation"
        value={operation || 'Any'}
        code={Boolean(operation)}
        quiet={!operation}
      >
        <Input
          aria-label="GraphQL operation"
          className="bg-background font-mono"
          value={match.graphqlOperation}
          placeholder="GetUser"
          onChange={(event) =>
            edit((current) => {
              current.graphqlOperation = event.target.value;
            })
          }
        />
        <CardHint>
          Only the requests whose GraphQL body names this operation. Leave it empty for
          every request the URL matches.
        </CardHint>
      </SettingRow>
    </SettingsCard>
  );
}

// The URL pattern. A rule that was just created opens with this row open and the cursor here.
function UrlField({
  value,
  focus,
  onChange,
}: {
  value: string;
  focus: boolean;
  onChange: (value: string) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focus) field.current?.focus();
  }, [focus]);
  return (
    <Input
      ref={field}
      data-testid="match-url"
      aria-label="URL pattern"
      className="bg-background font-mono"
      value={value}
      placeholder="/api/users"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
