export type Theme = 'light' | 'dark';

const KEY = 'fw-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

export function currentTheme(): Theme {
  const set = document.documentElement.getAttribute('data-theme');
  if (set === 'light' || set === 'dark') return set;
  return media.matches ? 'dark' : 'light';
}

/** Wires the header toggle; calls `onChange` whenever the effective theme changes. */
export function initTheme(button: HTMLButtonElement, onChange: (theme: Theme) => void): void {
  const label = () => {
    button.setAttribute('aria-label', currentTheme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  };
  button.addEventListener('click', () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private browsing or storage turned off: the choice lasts for this visit.
    }
    label();
    onChange(next);
  });
  media.addEventListener('change', () => {
    if (!document.documentElement.hasAttribute('data-theme')) {
      label();
      onChange(currentTheme());
    }
  });
  label();
}

/** Reads a color token from the stylesheet, for map layers (which can't use CSS variables). */
export function cssColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}
