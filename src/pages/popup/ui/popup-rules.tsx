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
    // The dot lines up with the "Rules" label above, 14 px in, and sits 11 px before the name.
    <li
      data-testid="popup-rule"
      className="flex items-center gap-[2px] border-b border-line-soft px-3.5 py-[5px] hover:bg-hover"
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
