// Every rule, with how many are on: a switch for each (the green dot), and its name, which
// opens it in the editor.
import { openRuleInEditor, ruleTitle } from '../../../shared/api/index.ts';
import type { Rule } from '../../../shared/api/index.ts';
import { cn } from '../../../shared/ui/cn.ts';
import { RuleSwitch } from '../../../shared/ui/rule-switch.tsx';

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
      <div className="-mb-1 flex items-center justify-between px-1 pt-1 text-label font-medium text-t40">
        <span>Rules</span>
        <span className="tabular-nums">
          {rules.length ? `${active} of ${rules.length} on` : ''}
        </span>
      </div>
      <ul
        className={cn(
          'max-h-[300px] overflow-auto rounded-lg bg-card p-1 scroll-thin empty:hidden',
          dimmed && 'opacity-55',
        )}
      >
        {rules.map((rule) => (
          <PopupRule key={rule.id} rule={rule} windowId={windowId} />
        ))}
      </ul>
      {!rules.length && (
        <p className="px-1 text-small text-t40">
          No rules yet. Open the editor to create one.
        </p>
      )}
    </>
  );
}

function PopupRule({ rule, windowId }: { rule: Rule; windowId: number }) {
  return (
    // The dot sits 14 px in from the card's edge, and 11 px before the name.
    <li
      data-testid="popup-rule"
      className="flex items-center gap-[2px] rounded-md px-2.5 py-[3px] hover:bg-hover"
    >
      <RuleSwitch rule={rule} immediate className="-ml-[9px]" />
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
    </li>
  );
}
