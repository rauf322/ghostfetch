// The themes the ⋯ menu offers (Theme), and the one in use: its name on <html> as data-theme, which
// picks its colours from src/app/styles/themes.css. Remembered in this browser (localStorage, which
// all of Ghostfetch's pages share), where public/theme.js reads it back before each page draws.
// Ghostfetch's own is the default, and stores nothing.
//
// Appearance, the row under Theme, is three settings kept the same way, each a few steps: its key
// is ghostfetch.<setting> and its attribute data-<setting> (data-contrast, data-font, data-size),
// which src/app/styles/theme.css and kit.css draw with. A setting's first step is its default,
// which stores nothing and puts no attribute.
export const THEMES = [
  { id: 'ghostfetch', name: 'Ghostfetch' },
  { id: 'rose-pine', name: 'Rosé Pine' },
  { id: 'rose-pine-moon', name: 'Rosé Pine Moon' },
  { id: 'rose-pine-dawn', name: 'Rosé Pine Dawn' },
  { id: 'catppuccin-macchiato', name: 'Catppuccin Macchiato' },
  { id: 'vague', name: 'Vague' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

// The same key as public/theme.js.
const KEY = 'ghostfetch.theme';
const DEFAULT: ThemeId = 'ghostfetch';

export function currentTheme(): ThemeId {
  const id = document.documentElement.dataset.theme;
  return THEMES.find((theme) => theme.id === id)?.id ?? DEFAULT;
}

export function setTheme(id: ThemeId) {
  const root = document.documentElement;
  if (id === DEFAULT) {
    localStorage.removeItem(KEY);
    delete root.dataset.theme;
  } else {
    localStorage.setItem(KEY, id);
    root.dataset.theme = id;
  }
}

// Contrast lifts the grey text and the lines toward the text, Font puts words in Commit Mono as
// code is, and Text size makes the type larger: steps rather than T3 Code's sliders, which need a
// settings page of their own.
export const APPEARANCE = {
  contrast: {
    name: 'Contrast',
    steps: [
      { id: 'standard', name: 'Standard' },
      { id: 'more', name: 'More' },
      { id: 'most', name: 'Most' },
    ],
  },
  font: {
    name: 'Font',
    steps: [
      { id: 'geist', name: 'Geist' },
      { id: 'mono', name: 'Commit Mono' },
    ],
  },
  size: {
    name: 'Text size',
    steps: [
      { id: 'default', name: 'Default' },
      { id: 'large', name: 'Large' },
      { id: 'larger', name: 'Larger' },
    ],
  },
} as const;

export type Setting = keyof typeof APPEARANCE;
export type StepId<S extends Setting> = (typeof APPEARANCE)[S]['steps'][number]['id'];
export const SETTINGS = Object.keys(APPEARANCE) as Setting[];

const stepsOf = (setting: Setting): readonly { id: string; name: string }[] =>
  APPEARANCE[setting].steps;

// The step of a setting in use, as <html> has it.
export function currentStep<S extends Setting>(setting: S): StepId<S> {
  const id = document.documentElement.dataset[setting];
  const steps = stepsOf(setting);
  return (steps.find((step) => step.id === id) ?? steps[0]).id as StepId<S>;
}

export function setStep<S extends Setting>(setting: S, id: StepId<S>) {
  const root = document.documentElement;
  // The same keys as public/theme.js.
  const key = `ghostfetch.${setting}`;
  if (id === stepsOf(setting)[0].id) {
    localStorage.removeItem(key);
    delete root.dataset[setting];
  } else {
    localStorage.setItem(key, id);
    root.dataset[setting] = id;
  }
}
