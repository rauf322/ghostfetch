// The kit page's one view: every component of src/shared/ui/kit/ in its states, a numbered cell
// for each (sections/). Hover and focus are shown by adding the classes those states add, so they
// appear in a still screenshot. The rest is live, and test/kit.mjs drives it with the keyboard and
// the mouse (data-testid="kit-..."). With ?open the select and the menu are also shown held open,
// for screenshots.
import { AlertSection } from './sections/alert-section.tsx';
import { BadgeSection } from './sections/badge-section.tsx';
import { ButtonSection } from './sections/button-section.tsx';
import { EmptySection } from './sections/empty-section.tsx';
import { IconsSection } from './sections/icons-section.tsx';
import { InputSection } from './sections/input-section.tsx';
import { ItemSection } from './sections/item-section.tsx';
import { SegmentedSection } from './sections/segmented-section.tsx';
import { SelectSection } from './sections/select-section.tsx';
import { TabsSection } from './sections/tabs-section.tsx';
import { ToggleSection } from './sections/toggle-section.tsx';

export function KitSheet({ open }: { open: boolean }) {
  return (
    <div className="grid w-[1180px] grid-cols-2 gap-px border border-border bg-border">
      <ButtonSection index={1} />
      <ToggleSection index={2} />
      <TabsSection index={3} />
      <SegmentedSection index={4} />
      <InputSection index={5} />
      <SelectSection index={6} open={open} />
      <BadgeSection index={7} />
      <AlertSection index={8} />
      <ItemSection index={9} />
      <EmptySection index={10} />
      <IconsSection index={11} />
    </div>
  );
}
