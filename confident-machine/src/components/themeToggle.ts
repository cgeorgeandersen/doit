/**
 * Theme toggle: Auto (follow the system) → Light → Dark. An explicit choice is
 * stamped on <html data-theme>, which the token CSS honours in both directions.
 */
import { h } from '../lib/dom';

type Mode = 'auto' | 'light' | 'dark';
const KEY = 'cm-theme';
const ORDER: Mode[] = ['auto', 'light', 'dark'];
const LABEL: Record<Mode, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' };

function read(): Mode {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function apply(mode: Mode): void {
  if (mode === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  try {
    if (mode === 'auto') window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
}

export function themeToggle(): HTMLButtonElement {
  let mode = read();
  const text = h('span', { class: 'theme-label' });
  const button = h('button', { type: 'button', class: 'theme-toggle mono' }, h('span', { class: 'theme-icon', 'aria-hidden': 'true' }), text);
  const render = () => {
    const nextMode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]!;
    text.textContent = LABEL[mode];
    button.dataset.mode = mode;
    button.setAttribute('aria-label', `Color theme: ${LABEL[mode]}. Switch to ${LABEL[nextMode]}.`);
  };
  button.addEventListener('click', () => {
    mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]!;
    apply(mode);
    render();
  });
  render();
  return button;
}
