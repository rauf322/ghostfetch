// Every rule, with how many are on: a switch for each, its name, which opens it in the editor, and
// its type.
import { TYPES, openRuleInEditor, ruleTitle } from '../../../shared/api/index.ts';
import type { Rule } from '../../../shared/api/index.ts';
import { cn } from '../../../shared/ui/cn.ts';
import { Badge } from '../../../shared/ui/kit/badge.tsx';
import { Switch } from '../../../shared/ui/kit/switch.tsx';
import { switchRule } from '../model/switch-rule.ts';

export function PopupRules({
  rules,
  windowId,
  dimmed,
}: {
  rules: Rule[];
  windowId: number;
  dimmed: boolean;
}) {
  const active = rules.filter((rule) => rule.enabled).length;
  return (
    <>
      <div className="flex h-[34px] items-center justify-between border-b border-border px-3.5 text-label uppercase tracking-label text-t40">
        <span>Rules</span>
        <span className="tracking-wider">
          {rules.length ? `${active} / ${rules.length} on` : ''}
        </span>
      </div>
      <ul
        className={cn('max-h-[300px] overflow-auto scroll-thin', dimmed && 'opacity-55')}
      >
        {rules.map((rule) => (
          <PopupRule key={rule.id} rule={rule} windowId={windowId} />
        ))}
      </ul>
      {!rules.length && (
        <p className="p-3.5 text-small text-t40">
          No rules yet. Open the editor to create one.
        </p>
      )}
    </>
  );
}

function PopupRule({ rule, windowId }: { rule: Rule; windowId: number }) {
  return (
    <li
      data-testid="popup-rule"
      className="flex items-center gap-[11px] border-b border-line-soft px-3.5 py-2 hover:bg-hover"
    >
      <Switch
        size="sm"
        checked={rule.enabled}
        aria-label={`Turn “${ruleTitle(rule)}” on or off`}
        onCheckedChange={(on) => switchRule(rule.id, on)}
      />
      <button
        type="button"
        title="Edit this rule"
        onClick={() => openRuleInEditor(rule.id, windowId)}
        className={cn(
          'min-w-0 flex-1 truncate text-left hover:underline hover:decoration-t40 hover:underline-offset-3',
          rule.enabled ? 'text-foreground' : 'text-t40',
        )}
      >
        {ruleTitle(rule)}
      </button>
      <Badge className="text-t30">{TYPES[rule.type].short}</Badge>
    </li>
  );
}
