import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/chapters/masthead.css';
import './styles/chapters/opening.css';
import './styles/chapters/prediction.css';
import './styles/chapters/calibration.css';
import './styles/chapters/frontier.css';
import './styles/chapters/trustmap.css';
import './styles/chapters/responsible.css';
import './styles/chapters/moving.css';
import './styles/chapters/close.css';

import { idle, qs, qsOptional, whenNear } from './lib/dom';
import { fmtDate } from './lib/format';
import { hydrateTimely } from './lib/timely';
import { initCitations } from './lib/citations';
import { initNavigator } from './components/navigator';
import { initCaseFile } from './components/caseFile';
import { mountOpening } from './chapters/opening';
import { startAnalytics } from './lib/analytics';

type Mount = (section: HTMLElement) => void | Promise<void>;

/** Chapters mount when the reader nears them, or during idle time, whichever comes first. */
const LAZY_CHAPTERS: Array<[string, () => Promise<Mount>]> = [
  ['#prediction', () => import('./chapters/prediction').then((m) => m.mountPrediction)],
  ['#confidently-wrong', () => import('./chapters/calibration').then((m) => m.mountCalibration)],
  ['#jagged-frontier', () => import('./chapters/frontier').then((m) => m.mountFrontier)],
  ['#trust-map', () => import('./chapters/trustmap').then((m) => m.mountTrustMap)],
  ['#when-trust-scales', () => import('./chapters/responsible').then((m) => m.mountResponsible)],
  ['#moving-boundary', () => import('./chapters/moving').then((m) => m.mountMoving)],
  ['#what-we-keep', () => import('./chapters/close').then((m) => m.mountClose)],
];

function boot(): void {
  const built = __BUILD_DATE__.slice(0, 10);
  document.querySelectorAll<HTMLElement>('[data-build-date]').forEach((el) => {
    el.textContent = `Built ${fmtDate(built)}`;
    el.setAttribute('title', `This page was built on ${fmtDate(built)}. Dated claims show when each was last checked.`);
  });

  // Time-sensitive claims first, so their citations get numbered with the rest.
  hydrateTimely(document);
  initCitations();
  initNavigator(qs('#site-nav'));
  initCaseFile(qs('#casefile-root'));
  mountOpening(qs('#opening'));

  for (const [selector, load] of LAZY_CHAPTERS) {
    const section = qsOptional(selector);
    if (!section) continue;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      load()
        .then((mount) => mount(section))
        .catch((err) => {
          console.error(`Could not load ${selector}`, err);
          section.classList.add('mount-failed');
        });
    };
    whenNear(section, start, '1200px');
    idle(start, 4000);
  }
}

boot();
startAnalytics();
