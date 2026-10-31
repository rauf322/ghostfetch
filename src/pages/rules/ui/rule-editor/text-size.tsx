// The body editor's text size, three cells in one hairline box: − and + step through FONT_SIZES,
// and the size between them puts it back to the default.
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZES,
} from '../../../../shared/ui/code-editor/index.ts';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';

export function TextSize({
  value,
  onChange,
}: {
  value: number;
  onChange: (size: number) => void;
}) {
  const at = FONT_SIZES.indexOf(value);
  return (
    <fieldset className="flex h-[26px] flex-none border border-input">
      <legend className="sr-only">Text size</legend>
      <Button
        variant="ghost"
        size="icon-sm"
        data-testid="font-smaller"
        title="Smaller text"
        disabled={at <= 0}
        onClick={() => onChange(FONT_SIZES[at - 1]!)}
        className="h-full"
      >
        <Icon name="minus" size={12} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        data-testid="font-size"
        title={`Text size ${value} px: back to ${DEFAULT_FONT_SIZE}`}
        onClick={() => onChange(DEFAULT_FONT_SIZE)}
        className="h-full min-w-10 border-x border-y-0 border-input px-1.5 font-normal tracking-normal tabular-nums"
      >
        {value}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        data-testid="font-larger"
        title="Larger text"
        disabled={at === FONT_SIZES.length - 1}
        onClick={() => onChange(FONT_SIZES[at + 1]!)}
        className="h-full"
      >
        <Icon name="plus" size={12} />
      </Button>
    </fieldset>
  );
}
