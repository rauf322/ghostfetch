// A group's chip (Monogram), as the editor's rule list draws it beside the group's name: the five
// colours, each by a name that picks it, and a group that's off, whose chip steps back. The kit
// test reads each chip's letters against its tile in every theme at every Contrast.
import { Monogram } from '../../../../ui/kit/monogram.tsx';
import { cn } from '../../../../ui/cn.ts';
import { Cell, Row } from '../cell.tsx';

// A name for each colour, in order (monogramColour()).
const NAMES = ['Staging', 'Mobile', 'Billing GraphQL', 'PR 412 · checkout', 'Payments'];

function Named({ name, off = false }: { name: string; off?: boolean }) {
  return (
    <span data-testid="kit-monogram" className="flex items-center gap-2">
      <Monogram name={name} off={off} />
      <span
        className={cn('text-title font-semibold', off ? 'text-t50' : 'text-foreground')}
      >
        {name}
      </span>
    </span>
  );
}

export function MonogramSection() {
  return (
    <Cell title="Group chip" note="two letters and a colour, from the name">
      <Row
        label="The five colours"
        className="flex flex-wrap items-center gap-x-5 gap-y-2"
      >
        {NAMES.map((name) => (
          <Named key={name} name={name} />
        ))}
      </Row>
      <Row label="A group that's off" className="flex flex-wrap items-center gap-5">
        <Named name="Billing GraphQL" off />
      </Row>
    </Cell>
  );
}
