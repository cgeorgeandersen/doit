import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/chrome.css';
import './styles/app.css';

import { App } from './app.ts';
import { emailAdapter } from './email/index.ts';
import { startAnalytics } from './lib/analytics.ts';
import { initTheme } from './ui/theme.ts';

initTheme();
startAnalytics();
new App(emailAdapter).start();

// "How the score works" is folded away on screen; open it for printing, then fold it again.
let unfolded: HTMLDetailsElement[] = [];
window.addEventListener('beforeprint', () => {
  unfolded = [...document.querySelectorAll<HTMLDetailsElement>('details:not([open])')];
  for (const details of unfolded) details.open = true;
});
window.addEventListener('afterprint', () => {
  for (const details of unfolded) details.open = false;
  unfolded = [];
});
