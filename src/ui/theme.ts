// The themes the ⋯ menu offers (Theme), and the one in use: its name on <html> as data-theme, which
// picks its colours from src/app/styles/themes.css. Remembered in this browser (localStorage, which
// all of Ghostfetch's pages share), where public/theme.js reads it back before each page draws.
// Ghostfetch's own is the default, and stores nothing.
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
