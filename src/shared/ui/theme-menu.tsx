// The Theme row of a ⋯ menu, with the theme in use at its right. It opens the themes beside it,
// each with a swatch, and a click recolours every page of Ghostfetch's at once. The menu stays
// open, so you can try one after another.
import { useState } from 'react';
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from './kit/dropdown-menu.tsx';
import { Icon } from './kit/icon.tsx';
import { THEMES, currentTheme, setTheme } from './theme.ts';
import type { ThemeId } from './theme.ts';

export function ThemeMenu() {
  // Read as the menu opens (its rows are only drawn while it's open), so a theme picked in
  // another window shows as the one in use.
  const [theme, setChosen] = useState(currentTheme);
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-testid="theme-menu">
        <Icon name="theme" /> Theme
        <span className="ml-auto pl-4 text-t40">
          {THEMES.find((item) => item.id === theme)!.name}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(next: ThemeId) => {
            setTheme(next);
            setChosen(next);
          }}
        >
          {THEMES.map((item) => (
            <DropdownMenuRadioItem
              key={item.id}
              value={item.id}
              data-testid={`theme-${item.id}`}
            >
              <ThemeSwatch id={item.id} />
              {item.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

// A theme's page colour with its green and its text as two dots. The swatch carries the theme's
// data-theme, so the variables read here (bg-(--bg), not bg-background, which <html> resolves)
// are that theme's.
function ThemeSwatch({ id }: { id: ThemeId }) {
  return (
    <span
      data-theme={id}
      aria-hidden="true"
      className="flex h-[18px] w-7 flex-none items-center justify-center gap-[3px] rounded-[5px] bg-(--bg) shadow-[inset_0_0_0_1px_var(--line-strong)]"
    >
      <span className="size-1.5 rounded-full bg-(--signal)" />
      <span className="size-1.5 rounded-full bg-(--text)" />
    </span>
  );
}
