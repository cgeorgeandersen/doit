import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/tool.css';
import './styles/content.css';

import { inject, track } from '@vercel/analytics';
import { App } from './app';
import { EXAMPLES } from './content/examples';
import { contactKind, pageAddress } from './lib/analytics';
import { fmtDate, fmtInt } from './lib/format';
import { loadMeta, loadOverview } from './lib/tiles';
import { startHalloween } from './seasonal/halloween';
import { h, qs } from './ui/dom';
import { currentTheme, initTheme } from './ui/theme';

function showStats(): void {
  loadMeta()
    .then((meta) => {
      const c = meta.cameras;
      const asOf = c.dataAsOf ? fmtDate(c.dataAsOf) : fmtDate(meta.generated);
      qs('#stat-line').replaceChildren(
        h('b', null, fmtInt(c.flock)),
        ' Flock cameras and ',
        h('b', null, fmtInt(c.total - c.flock)),
        ' other plate readers mapped by volunteers so far. Data from ',
        h('a', { href: 'https://deflock.me', target: '_blank', rel: 'noopener' }, 'DeFlock'),
        ` and OpenStreetMap, as of ${asOf}.`,
      );
      document.querySelectorAll<HTMLElement>('[data-stat="flock"]').forEach((el) => {
        el.textContent = `More than ${fmtInt(Math.floor(c.flock / 1000) * 1000)}`;
      });
      document.querySelectorAll<HTMLElement>('[data-stat="asof"]').forEach((el) => {
        el.textContent = `last updated ${asOf}`;
      });
    })
    .catch((err: Error) => {
      qs('#stat-line').textContent = err.message;
    });
}

function showExamples(app: App): void {
  const box = qs('#examples');
  for (const ex of EXAMPLES) {
    box.append(h('button', { type: 'button', class: 'chip', onclick: () => void app.go(ex.from, ex.to) }, ex.label));
  }
}

// Counts visits on the live site with Vercel Web Analytics, taking the route
// out of every address it reports, and taps on links that reach an official
// (src/ui/contact.ts marks them). Development builds load nothing.
function countVisits(): void {
  if (!import.meta.env.PROD) return;
  inject({ mode: 'production', beforeSend: (event) => ({ ...event, url: pageAddress(event.url) }) });
  document.addEventListener('click', (e) => {
    const link = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[data-contact]') : null;
    if (link) track('Contact', { kind: contactKind(link.getAttribute('href') ?? ''), level: link.dataset.contact ?? '' });
  });
}

function boot(): void {
  countVisits();
  startHalloween();
  const app = new App(currentTheme());
  initTheme(qs<HTMLButtonElement>('#theme-toggle'), (theme) => app.setTheme(theme));
  showStats();
  showExamples(app);
  loadOverview()
    .then((cells) => app.map.setOverview(cells))
    .catch((err) => console.warn('Could not load the camera overview', err));
  if (location.hash.includes('from=')) void app.openShared(location.hash);
  // Handy in development: inspect the map from the browser console.
  if (import.meta.env.DEV) Object.assign(window, { flockwatch: app });
}

boot();
