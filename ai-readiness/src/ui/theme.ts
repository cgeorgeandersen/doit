/**
 * Auto (follow the system) → Light → Dark, the portfolio's ThemeToggle. An
 * explicit choice is stamped on <html data-theme> (public/theme-init.js
 * applies a saved one before the page paints), and the visible label is
 * picked by CSS from that attribute, so the button never flickers.
 */
import { CONTENT } from '../content.ts';
import { tx } from '../lib/text.ts';

type ThemeMode = 'auto' | 'light' | 'dark';
const KEY = 'ga-theme';
const ORDER: ThemeMode[] = ['auto', 'light', 'dark'];

const current = (): ThemeMode => {
  const t = document.documentElement.dataset.theme;
  return t === 'light' || t === 'dark' ? t : 'auto';
};
const next = (mode: ThemeMode): ThemeMode => ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length] ?? 'auto';

function apply(mode: ThemeMode): void {
  if (mode === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  try {
    if (mode === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    // Storage can be off (private browsing); the choice then lasts for this page.
  }
}

export function initTheme(): void {
  const words = CONTENT.a11y.theme;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
    const describe = () => {
      const mode = current();
      button.setAttribute('aria-label', tx(words.label, { mode: words[mode], next: words[next(mode)] }));
    };
    button.addEventListener('click', () => {
      apply(next(current()));
      describe();
    });
    describe();
  }
}
