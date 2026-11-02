// New rule, after ChatGPT's first screen: "What should Ghostfetch answer?", one input for a URL or
// a cURL command with the pickers under it, the starters, and the page's latest requests to mock.
// Everything is read here, with nothing sent anywhere. Enter makes the rule and opens it, with the
// cursor in its body. Beside the list it's also what shows with no rule open; in a narrow panel it
// takes the list's place, with a button back to it.
import { useEffect, useRef, useState } from 'react';
import type { Method, Rule, TrafficLog } from '../../../../shared/api/index.ts';
import { PaneScroll } from '../../../../shared/ui/list-detail.tsx';
import {
  NEW_DRAFT,
  PLAIN_ANSWER,
  STARTERS,
  readTyped,
  ruleFromDraft,
} from '../../lib/rule-draft.ts';
import type { Draft, StarterId } from '../../lib/rule-draft.ts';
import { RulesHead } from '../rules-head.tsx';
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
  onMock: (rule: Rule) => void;
  onCancel: () => void;
  onOpenTraffic: () => void;
}) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft>(NEW_DRAFT);
  // The method the picker was set to, for when what's typed stops naming one.
  const [picked, setPicked] = useState<Method>(NEW_DRAFT.method);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focus) field.current?.focus();
  }, [focus]);

  // A method in what's typed ("POST /api/…", or a cURL command's) sets the method as it appears,
  // and the picker's own choice comes back when it goes. In between, the text is only read for a
  // change, so what the picker was set to stays as you type.
  function changeText(next: string) {
    const was = readTyped(text).method;
    const now = readTyped(next).method;
    setText(next);
    if (now !== was) setDraft((current) => ({ ...current, method: now ?? picked }));
  }

  // A picker's change. The status and the delay are the answer's, so they unpick the starter.
  function change(next: Partial<Draft>) {
    if (next.method) setPicked(next.method);
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
      <RulesHead title="New rule" backTestId="composer-back" onBack={onCancel} />
      <PaneScroll className="@container/composer">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 pt-[clamp(8px,9vh,88px)] pb-8">
          <header className="flex flex-col gap-2.5 text-center">
            <h1 className="text-[24px] leading-tight font-semibold tracking-tight text-strong @[520px]/composer:text-[30px]">
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
            onTextChange={changeText}
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
