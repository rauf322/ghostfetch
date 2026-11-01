// Tabs as in the editor's top bar, live, and a list's section labels.
import { useState } from 'react';
import { Label } from '../../../../shared/ui/kit/label.tsx';
import {
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from '../../../../shared/ui/kit/tabs.tsx';
import { Cell, Row } from '../cell.tsx';

export function TabsSection() {
  const [view, setView] = useState('rules');
  return (
    <Cell title="Tabs" note="the top bar's (live: arrows move, Enter opens)">
      <Tabs
        value={view}
        onValueChange={(next) => setView(next as string)}
        data-testid="kit-tabs"
        className="w-[400px] flex-col rounded-lg border border-border"
      >
        <div className="flex h-12 items-stretch gap-2 border-b border-border px-2">
          <div className="flex items-center gap-2 pr-1 pl-1.5 text-title font-semibold whitespace-nowrap text-foreground">
            <img
              src="/icons/icon32.png"
              width={18}
              height={18}
              alt=""
              className="block"
            />
            Ghostfetch
          </div>
          <TabsList>
            <TabsTrigger value="rules">
              Rules <TabsCount>8</TabsCount>
            </TabsTrigger>
            <TabsTrigger value="traffic">
              Traffic <TabsCount>14</TabsCount>
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="rules" className="p-3.5 text-small text-t50">
          The rule list.
        </TabsContent>
        <TabsContent value="traffic" className="p-3.5 text-small text-t50">
          The traffic log.
        </TabsContent>
      </Tabs>
      <Row
        label="Section labels: a list's name and its count"
        className="flex h-7 w-[400px] items-center justify-between px-4"
      >
        <Label>Rules</Label>
        <Label className="tabular-nums">6 of 8 on</Label>
      </Row>
    </Cell>
  );
}
