// The Theme row of a ⋯ menu, with the theme in use at its right. It opens the themes beside it,
// each with a swatch, and a click recolours every page of Ghostfetch's at once. The menu stays
// open, so you can try one after another.
//
// And the Appearance row under it, with the steps in use that aren't the defaults at its right
// ("Default" while none is). It opens Contrast, Font and Text size beside it, a labelled group
// each, and a step picked applies to every page at once, the menu staying open as Theme's does.
import { Fragment, useState } from 'react';
import {
  DropdownMenuDetail,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from './kit/dropdown-menu.tsx';
import { Icon } from './kit/icon.tsx';
import {
  APPEARANCE,
  SETTINGS,
  THEMES,
  currentStep,
  currentTheme,
  setStep,
  setTheme,
} from './theme.ts';
import type { Setting, StepId, ThemeId } from './theme.ts';

export function ThemeMenu() {
  // Read as the menu opens (its rows are only drawn while it's open), so a theme picked in
  // another window shows as the one in use.
  const [theme, setChosen] = useState(currentTheme);
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-testid="theme-menu">
        <Icon name="theme" /> Theme
        <DropdownMenuDetail>
          {THEMES.find((item) => item.id === theme)!.name}
        </DropdownMenuDetail>
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

export function AppearanceMenu() {
  // Read as the menu opens, as the theme is.
  const [steps, setSteps] = useState(
    () =>
      Object.fromEntries(SETTINGS.map((setting) => [setting, currentStep(setting)])) as {
        [S in Setting]: StepId<S>;
      },
  );
  const changed = SETTINGS.filter(
    (setting) => steps[setting] !== APPEARANCE[setting].steps[0].id,
  ).map(
    (setting) =>
      APPEARANCE[setting].steps.find((step) => step.id === steps[setting])?.name,
  );
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-testid="appearance-menu">
        <Icon name="type" /> Appearance
        {/* Whole: the menu grows for it (dropdown-menu.tsx), within the window. */}
        <DropdownMenuDetail>{changed.join(', ') || 'Default'}</DropdownMenuDetail>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {SETTINGS.map((setting, index) => (
          <Fragment key={setting}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuRadioGroup
              value={steps[setting]}
              onValueChange={(next: StepId<Setting>) => {
                setStep(setting, next);
                setSteps((now) => ({ ...now, [setting]: next }));
              }}
            >
              <DropdownMenuLabel>{APPEARANCE[setting].name}</DropdownMenuLabel>
              {APPEARANCE[setting].steps.map((step) => (
                <DropdownMenuRadioItem
                  key={step.id}
                  value={step.id}
                  data-testid={`${setting}-${step.id}`}
                >
                  {step.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </Fragment>
        ))}
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
