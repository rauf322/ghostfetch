// New rule, after ChatGPT's first screen: "What should Ghostfetch answer?", one input for a URL or
// a cURL command with the pickers under it, the starters, and the page's latest requests to mock.
// Everything is read here, with nothing sent anywhere. Enter makes the rule and opens it, with the
// cursor in its body. Beside the list it's also what shows with no rule open; in a narrow panel it
// takes the list's place, with a button back to it.
import { useEffect, useRef, useState } from 'react';
import type { Rule, TrafficLog } from '../../../../shared/api/index.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { PaneHead, PaneScroll } from '../../../../shared/ui/list-detail.tsx';
import {
  NEW_DRAFT,
  PLAIN_ANSWER,
  STARTERS,
  readTyped,
  ruleFromDraft,
} from '../../lib/rule-draft.ts';
import type { Draft, StarterId } from '../../lib/rule-draft.ts';
import { RecentRequests } from './recent-requests.tsx';
import { RequestInput } from './request-input.tsx';
import { Starters } from './starters.tsx';

export function NewRule({
  log,
  focus,
  onCreate,
  onMock,
  onCancel,
  onOpenTraffic,
}: {
  log: TrafficLog;
  // Put the cursor in the input: New rule was clicked.
  focus: boolean;
  onCreate: (rule: Rule) => void;
  onMock: (draft: Rule) => void;
  onCancel: () => void;
  onOpenTraffic: () => void;
}) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft>(NEW_DRAFT);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focus) field.current?.focus();
  }, [focus]);

  // A method in what's typed ("POST /api/…", or a cURL command's) picks the method.
  function type(next: string) {
    setText(next);
    const { method } = readTyped(next);
    if (method) setDraft((current) => ({ ...current, method }));
  }

  // A picker's change. The status and the delay are the answer's, so they unpick the starter.
  function change(next: Partial<Draft>) {
    const answers = Object.keys(PLAIN_ANSWER).some((key) => key in next);
    setDraft((current) => ({
      ...current,
      ...next,
      starter: answers ? null : current.starter,
    }));
  }

  // A starter sets the answer; clicking the chosen one again goes back to the plain one.
  function choose(id: StarterId) {
    const { answer } = STARTERS.find((starter) => starter.id === id)!;
    setDraft((current) =>
      current.starter === id
        ? { ...current, ...PLAIN_ANSWER, starter: null }
        : { ...current, ...answer, starter: id },
    );
    field.current?.focus();
  }

  function submit() {
    if (text.trim()) onCreate(ruleFromDraft(text, draft));
    else field.current?.focus();
  }

  return (
    <>
      <PaneHead className="h-12 items-center gap-1.5 border-b-0 px-2">
        <Button
          variant="ghost"
          size="sm"
          title="All rules"
          data-testid="composer-back"
          onClick={onCancel}
          className="gap-1 pr-2.5 pl-1 text-control text-t80 wide:hidden"
        >
          <Icon name="back" size={18} />
          Rules
        </Button>
        <span className="hidden px-2.5 text-control text-t40 wide:block">
          {'Rules '}
          <span className="text-t30">/</span> <span className="text-t80">New rule</span>
        </span>
      </PaneHead>
      <PaneScroll className="@container/composer">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 pt-[clamp(8px,9vh,88px)] pb-8">
          <header className="flex flex-col gap-2.5 text-center">
            <h1 className="text-[24px] leading-tight font-semibold tracking-tight text-white @[520px]/composer:text-[30px]">
              What should Ghostfetch answer?
            </h1>
            <p className="text-body leading-relaxed text-t50 @[520px]/composer:text-[15px]">
              Paste a URL or a cURL command. Ghostfetch fills in the rest, and you can
              change anything after.
            </p>
          </header>
          <RequestInput
            field={field}
            text={text}
            draft={draft}
            onTextChange={type}
            onDraftChange={change}
            onSubmit={submit}
          />
          <Starters chosen={draft.starter} onChoose={choose} />
          <RecentRequests log={log} onMock={onMock} onOpenTraffic={onOpenTraffic} />
        </div>
      </PaneScroll>
    </>
  );
}
