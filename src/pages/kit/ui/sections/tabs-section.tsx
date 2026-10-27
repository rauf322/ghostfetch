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

export function TabsSection({ index }: { index: number }) {
  const [view, setView] = useState('rules');
  return (
    <Cell
      index={index}
      title="Tabs"
      note="the top bar's (live: arrows move, Enter opens)"
    >
      <Tabs
        value={view}
        onValueChange={(next) => setView(next as string)}
        data-testid="kit-tabs"
        className="w-[400px] flex-col border border-border"
      >
        <div className="flex h-10 items-stretch border-b border-border">
          <div className="flex items-center gap-2 pr-[9px] pl-3 text-meta font-bold whitespace-nowrap text-t65 uppercase tracking-[0.08em]">
            <img
              src="/icons/icon32.png"
              width={16}
              height={16}
              alt=""
              className="block"
            />
            Ghostfetch
          </div>
          <TabsList>
            <TabsTrigger value="rules">
              Rules <TabsCount>08</TabsCount>
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
        className="flex h-[34px] w-[400px] items-center justify-between border border-border px-3.5"
      >
        <Label>Rules</Label>
        <Label className="tracking-wider">6 / 8 on</Label>
      </Row>
    </Cell>
  );
}
