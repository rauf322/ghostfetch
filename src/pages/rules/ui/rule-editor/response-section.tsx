// "02 — Body · Status · Headers · Delay": what a response rule sends back, a tab for each part, in
// the section's title bar. Each tab's label carries what it's set to (STATUS 404, HEADERS 2,
// DELAY 1 S), and BODY a cross while the body has a mistake. The Body tab stays mounted under the
// others, invisible: the body editor keeps its undo history and vim state, and the section is
// never shorter than the Body tab, so what's below doesn't jump as you switch tabs.
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
import { codeStatus } from '../../lib/rule-checks.ts';
import { formatDelay } from '../../lib/rule-summary.ts';
import { useEditorRoom } from '../../model/use-editor-room.ts';
import { useSettledStatus } from '../../model/use-settled-status.ts';
import { BodyPanel } from './body-panel.tsx';
import { DelayPanel } from './delay-panel.tsx';
import { HeadersPanel } from './headers-panel.tsx';
import { StatusPanel } from './status-panel.tsx';

type Tab = 'body' | 'status' | 'headers' | 'delay';

// The panels share one grid cell, so the area is as tall as the tallest one showing.
const PANEL = 'col-start-1 row-start-1 flex min-w-0 flex-col gap-[9px]';

export function ResponseSection({
  rule,
  index,
  revision,
}: {
  rule: Rule;
  index: number;
  // Moves when the rules were changed in another view, so the body editor starts over from them.
  revision: number;
}) {
  const [tab, setTab] = useState<Tab>('body');
  const section = useRef<HTMLDivElement>(null);
  const panels = useRef<HTMLDivElement>(null);
  const bodyPanel = useRef<HTMLDivElement>(null);
  useEditorRoom(section, panels, bodyPanel);
  const { response } = rule;
  const body = BODY_FIELDS[response.bodyMode];
  const text = body ? response[body.field] : '';
  const status = useSettledStatus(body ? codeStatus(rule, text) : null, text.length);
  const mistake = status?.tone === 'bad' && Boolean(status.text);

  return (
    <Tabs
      ref={section}
      value={tab}
      onValueChange={(value) => setTab(value as Tab)}
      className="flex-col gap-[9px] border-b border-border pb-3.5"
    >
      <CardTitle index={index} className="pr-0">
        <TabsList aria-label="Response" className="ml-1">
          <TabsTrigger value="body" data-testid="tab-body">
            Body
            {mistake && (
              <>
                <TabsCount
                  aria-hidden
                  className="text-foreground group-data-active/tab:text-foreground"
                >
                  ✗
                </TabsCount>
                <span className="sr-only">, has a mistake</span>
              </>
            )}
          </TabsTrigger>
          <TabsTrigger value="status" data-testid="tab-status">
            Status
            <TabsCount>{response.status}</TabsCount>
          </TabsTrigger>
          <TabsTrigger value="headers" data-testid="tab-headers">
            Headers
            <TabsCount>{response.headers.length || ''}</TabsCount>
          </TabsTrigger>
          <TabsTrigger value="delay" data-testid="tab-delay">
            Delay
            <TabsCount>{response.delay ? formatDelay(response.delay) : ''}</TabsCount>
          </TabsTrigger>
        </TabsList>
      </CardTitle>
      <div ref={panels} className="mx-3.5 grid">
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
      </div>
    </Tabs>
  );
}
