import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-400-italic.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-400.css';
import '@fontsource/ibm-plex-sans-condensed/latin-500.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/console.css';
import './styles/tools.css';
import './styles/story.css';

import { inject } from '@vercel/analytics';
import { placeByKey } from './core/city';
import { TODAY } from './core/time';
import { buildWorld, type World } from './core/world';
import { CASES } from './story/cases';
import { showDebrief } from './story/debrief';
import { Story } from './story/engine';
import { App, type Mode } from './ui/app-state';
import { Console } from './ui/console';
import { h } from './ui/dom';
import { bootSequence, showTitle } from './ui/title';
import { TOOLS } from './ui/tools';
import { ACOUSTIC_STATE } from './ui/tools/acoustic';

const root = document.getElementById('app') as HTMLElement;
let world: World | null = null;
const getWorld = (): World => (world ??= buildWorld());
let current: Console | null = null;

function title(): void {
  current?.stop();
  current = null;
  showTitle(root, world, { story: () => run('story'), free: () => run('free') }, getWorld);
}

function run(mode: Mode): void {
  const w = getWorld();
  bootSequence(root, w, () => {
    const app = new App(w, mode);
    ACOUSTIC_STATE.toasts = mode === 'free';
    const c = new Console(root, app, TOOLS);
    current = c;
    c.start();
    if (import.meta.env.DEV) Object.assign(window, { __dragnet: { c, app } });
    if (mode === 'story') {
      const story = new Story(c, CASES);
      if (import.meta.env.DEV) Object.assign(window, { __dragnet: { c, app, story } });
      story.onDone = () => {
        c.stop();
        current = null;
        showDebrief(root, app, story.records, CASES.length, { again: () => run('story'), free: () => run('free') });
      };
      c.onEndShift = () => {
        const box = c.modal(
          'End the shift?',
          h(
            'div',
            null,
            h('p', null, `You’re on case ${story.reached} of ${story.caseCount}. Ending now takes you to your shift report.`),
            h(
              'div',
              { class: 'actions' },
              h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { box.remove(); story.end(); } }, 'End the shift'),
              h('button', { class: 'btn', type: 'button', onclick: () => box.remove() }, 'Keep working'),
            ),
          ),
        );
      };
      story.start();
    } else {
      c.onEndShift = () => title();
      c.open('plates');
      freePlayCard(c);
    }
  });
}

function freePlayCard(c: Console): void {
  const w = c.app.world;
  const go = (label: string, run: () => void) =>
    h('button', { class: 'story-chip', type: 'button', onclick: () => { card.classList.add('collapsed'); run(); } }, label);
  const hall = placeByKey(w.city, 'city-hall').id;
  const card: HTMLElement = h(
    'section',
    { class: 'case free-card' },
    h(
      'button',
      { class: 'case-head', type: 'button', onclick: () => card.classList.toggle('collapsed') },
      h('span', { class: 'case-kicker' }, 'Free play · every tool is open'),
      h('span', { class: 'case-title' }, 'Things to try'),
      h('span', { class: 'case-toggle', 'aria-hidden': 'true' }, '▴'),
    ),
    h(
      'div',
      { class: 'case-body' },
      h(
        'ul',
        { class: 'tries' },
        h('li', null, go('Geofence City Hall during last Saturday’s rally', () => c.open('location', { place: hall, day: TODAY - 6, from: 660, to: 780 })), ' and see who showed up.'),
        h('li', null, go('Find every car with a STOP THE CAMERAS sticker', () => c.open('plates', { tab: 'look' })), ' with a description search, no plate needed.'),
        h('li', null, go('Put a plate on the hotlist', () => c.open('plates', { tab: 'hotlist' })), ' (tap any moving car to get one) and wait for a camera to read it.'),
        h('li', null, go('Tap any house on the map', () => { c.revealMap(); c.toast('Tap any house on the map to see who lives there.'); }), ' to see who lives there, then build their dossier.'),
        h('li', null, go('Pull faces from the Transit Center camera', () => c.open('face', { cctv: 2 })), ' and see how often the right person comes first.'),
        h('li', null, go('Run the patrol forecast twice', () => c.open('forecast')), ', with and without the fix.'),
      ),
    ),
  );
  c.caseHost.append(card);
}

title();

// Page views only, no cookies.
inject({ mode: 'production' });
