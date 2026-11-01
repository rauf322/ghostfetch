// The Match tab: the requests a rule answers. The method, how the URL is compared and the pattern,
// a GraphQL operation, and a field to try the pattern on a URL.
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
import { FieldLabel } from '../../../../shared/ui/kit/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../shared/ui/kit/select.tsx';
import { regexError, testResult } from '../../lib/rule-checks.ts';
import { Verdict } from './verdict.tsx';

const METHOD_ITEMS = METHODS.map((method) => ({
  value: method,
  label: method === 'ANY' ? 'Any method' : method,
}));
const MODE_ITEMS = (Object.entries(MATCH_MODES) as [MatchMode, string][]).map(
  ([value, label]) => ({ value, label: `URL ${label.toLowerCase()}` }),
);

export function MatchPanel({
  rule,
  focusUrl,
  testedUrl,
  onTestedUrlChange,
}: {
  rule: Rule;
  // Put the cursor in the URL field, for a rule that was just created.
  focusUrl: boolean;
  // The URL being tried, which RuleTabs keeps, so it stays as you switch tabs.
  testedUrl: string;
  onTestedUrlChange: (url: string) => void;
}) {
  const urlField = useRef<HTMLInputElement>(null);
  const { match } = rule;

  useEffect(() => {
    if (focusUrl) urlField.current?.focus();
  }, [focusUrl]);

  const regexProblem = regexError(rule);
  const tested = testedUrl.trim() ? testResult(rule, testedUrl.trim()) : null;

  return (
    <>
      <div className="flex gap-2">
        <Select
          items={METHOD_ITEMS}
          value={match.method}
          onValueChange={(method) =>
            editRule(rule.id, (current) => {
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
            editRule(rule.id, (current) => {
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
          editRule(rule.id, (current) => {
            current.match.url = event.target.value;
          })
        }
      />
      <CardHint tone={regexProblem ? 'bad' : 'default'}>
        {regexProblem || MATCH_HINTS[match.mode]}
      </CardHint>
      <label className="flex min-w-0 flex-col gap-[5px]">
        <FieldLabel>
          {'GraphQL operation '}
          <em className="tracking-mono text-t30 not-italic normal-case">optional</em>
        </FieldLabel>
        <Input
          value={match.graphqlOperation}
          placeholder="GetUser"
          onChange={(event) =>
            editRule(rule.id, (current) => {
              current.match.graphqlOperation = event.target.value;
            })
          }
        />
      </label>
      <div className="flex items-center gap-2.5">
        <Input
          size="sm"
          data-testid="tester"
          aria-label="Test URL"
          placeholder="Paste a URL to test the pattern"
          value={testedUrl}
          onChange={(event) => onTestedUrlChange(event.target.value)}
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
    </>
  );
}
