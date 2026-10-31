// "02 — Body · Status · Headers · Delay · Match": what a response rule sends back and the requests
// it answers, a tab for each, in the section's title bar. Each tab's label carries what it's set
// to (STATUS 404, HEADERS 2, DELAY 1 S, MATCH POST), and BODY and MATCH a cross while the body has
// a mistake or the pattern doesn't compile. A rule that was just created opens on Match, with the
// cursor in its URL field. The Body tab stays mounted under the others, invisible: the body
// editor keeps its undo history and vim state, and the section is never shorter than the Body tab,
// so it doesn't jump as you switch tabs.
import { useRef, useState } from 'react';
import type { Rule } from '../../../../shared/api/index.ts';
import { cn } from '../../../../shared/ui/cn.ts';
import { CardTitle } from '../../../../shared/ui/kit/card.tsx';
import {
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from '../../../../shared/ui/kit/tabs.tsx';
import { BODY_FIELDS } from '../../lib/body-fields.ts';
import { codeStatus, regexError } from '../../lib/rule-checks.ts';
import { formatDelay } from '../../lib/rule-summary.ts';
import { useEditorRoom } from '../../model/use-editor-room.ts';
import { useSettledStatus } from '../../model/use-settled-status.ts';
import { BodyPanel } from './body-panel.tsx';
import { DelayPanel } from './delay-panel.tsx';
import { HeadersPanel } from './headers-panel.tsx';
import { MatchFields } from './match-section.tsx';
import { StatusPanel } from './status-panel.tsx';

type Tab = 'body' | 'status' | 'headers' | 'delay' | 'match';

// The panels share one grid cell, so the area is as tall as the tallest one showing; each is as
// tall as its content, which useEditorRoom measures the Body tab by.
const PANEL = 'col-start-1 row-start-1 flex min-w-0 flex-col gap-[9px] self-start';
// In a section narrower than 460 px (a side panel) the tabs are closer together and the section's
// number gives them its room; narrower still, they scroll sideways rather than being cut off.
const TAB = '@max-[460px]:px-1.5';

export function ResponseSection({
  rule,
  index,
  revision,
  focusUrl,
  testedUrl,
  onTestedUrlChange,
}: {
  rule: Rule;
  index: number;
  // Moves when the rules were changed in another view, so the body editor starts over from them.
  revision: number;
  // A rule that was just created: open on Match, with the cursor in the URL field.
  focusUrl: boolean;
  // The URL being tried in the Match tab, which the rule editor keeps.
  testedUrl: string;
  onTestedUrlChange: (url: string) => void;
}) {
  const [tab, setTab] = useState<Tab>(focusUrl ? 'match' : 'body');
  const section = useRef<HTMLDivElement>(null);
  const bodyPanel = useRef<HTMLDivElement>(null);
  useEditorRoom(section, bodyPanel);
  const { response, match } = rule;
  const body = BODY_FIELDS[response.bodyMode];
  const text = body ? response[body.field] : '';
  const status = useSettledStatus(body ? codeStatus(rule, text) : null, text.length);
  const mistake = status?.tone === 'bad' && Boolean(status.text);

  return (
    <Tabs
      ref={section}
      value={tab}
      onValueChange={(value) => setTab(value as Tab)}
      className="@container flex-col gap-[9px] border-b border-border pb-3.5"
    >
      {/* Narrow, the first tab's label lines up with the panel under it. */}
      <CardTitle
        index={index}
        className="pr-0 @max-[460px]:pl-2 @max-[460px]:[&>[data-slot=card-index]]:hidden"
      >
        <TabsList
          aria-label="Response"
          className="ml-1 min-w-0 overflow-x-auto [scrollbar-width:none] @max-[460px]:ml-0"
        >
          <TabsTrigger
            value="body"
            data-testid="tab-body"
            className={cn(TAB, '@max-[460px]:border-l-0')}
          >
            Body
            {mistake && <Cross label="has a mistake" />}
          </TabsTrigger>
          <TabsTrigger value="status" data-testid="tab-status" className={TAB}>
            Status
            <TabsCount>{response.status}</TabsCount>
          </TabsTrigger>
          <TabsTrigger value="headers" data-testid="tab-headers" className={TAB}>
            Headers
            <TabsCount>{response.headers.length || ''}</TabsCount>
          </TabsTrigger>
          <TabsTrigger value="delay" data-testid="tab-delay" className={TAB}>
            Delay
            <TabsCount>{response.delay ? formatDelay(response.delay) : ''}</TabsCount>
          </TabsTrigger>
          <TabsTrigger value="match" data-testid="tab-match" className={TAB}>
            Match
            <TabsCount>{match.method === 'ANY' ? '' : match.method}</TabsCount>
            {regexError(rule) && <Cross label="the pattern doesn't compile" />}
          </TabsTrigger>
        </TabsList>
      </CardTitle>
      <div className="mx-3.5 grid">
        {/* Behind another tab, the Body tab keeps its place in the layout: inert and invisible
            rather than hidden, which would take it out (and Tailwind's hidden rule can't be
            overridden). */}
        <TabsContent
          ref={bodyPanel}
          value="body"
          keepMounted
          className={PANEL}
          render={(props, state) => (
            <div
              {...props}
              hidden={undefined}
              inert={state.hidden}
              className={cn(props.className, state.hidden && 'invisible')}
            />
          )}
        >
          <BodyPanel rule={rule} revision={revision} status={status} />
        </TabsContent>
        <TabsContent value="status" className={PANEL}>
          <StatusPanel rule={rule} />
        </TabsContent>
        <TabsContent value="headers" className={PANEL}>
          <HeadersPanel rule={rule} />
        </TabsContent>
        <TabsContent value="delay" className={PANEL}>
          <DelayPanel rule={rule} />
        </TabsContent>
        <TabsContent value="match" className={PANEL}>
          <MatchFields
            rule={rule}
            focusUrl={focusUrl}
            testedUrl={testedUrl}
            onTestedUrlChange={onTestedUrlChange}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
}

// A tab's cross, in white as errors are, and what it means for a screen reader.
function Cross({ label }: { label: string }) {
  return (
    <>
      <TabsCount
        aria-hidden
        className="text-foreground group-data-active/tab:text-foreground"
      >
        ✗
      </TabsCount>
      <span className="sr-only">, {label}</span>
    </>
  );
}
