/**
 * The title screen (with the city running behind it), the "how it works"
 * notes, and the boot sequence that plays before the console opens.
 */
import { gallery } from '../core/face';
import { sharesLocation } from '../core/location';
import { buildPosts } from '../core/social';
import { at, TODAY } from '../core/time';
import type { World } from '../core/world';
import { clear, h, num } from './dom';
import { MapView } from './map';

export interface TitleHandlers {
  story(): void;
  free(): void;
}

export function showTitle(root: HTMLElement, world: World | null, handlers: TitleHandlers, buildWorld: () => World): void {
  clear(root);
  const canvas = h('canvas', { class: 'title-map', 'aria-hidden': 'true' });
  const stats = h('div', { class: 'title-stats' }, 'Generating Port Avery…');
  const start = h('button', { class: 'btn btn-primary btn-big', type: 'button', disabled: true, onclick: () => handlers.story() }, 'Start the shift');
  const free = h('button', { class: 'btn btn-big', type: 'button', disabled: true, onclick: () => handlers.free() }, 'Free play');
  const about = h('button', { class: 'linkish', type: 'button', onclick: () => showAbout() }, 'How it works, and what’s real');
  root.append(
    h(
      'main',
      { class: 'title' },
      canvas,
      h('div', { class: 'title-shade' }),
      h(
        'div',
        { class: 'title-content' },
        h('p', { class: 'title-kicker' }, 'A police surveillance simulator'),
        h('h1', { class: 'title-name' }, 'DRAGNET'),
        h(
          'p',
          { class: 'title-lede' },
          'Work one shift at a police Real-Time Crime Center. Plate readers, phone location data, a cell-site simulator, face recognition, gunshot sensors, social media monitoring, predictive policing: every tool here is in use by U.S. police today. The city, its people and their cases are made up.',
        ),
        h('p', { class: 'title-lede title-lede-2' }, 'See what the tools can do, and what they can be made to do.'),
        h('div', { class: 'title-actions' }, start, free),
        h('p', { class: 'title-meta' }, 'Ten cases, about 25 minutes · sound helps · nothing you type leaves your browser'),
        h('p', { class: 'title-meta' }, 'The cases involve stalking, abortion and immigration enforcement. ', about),
      ),
      stats,
    ),
  );

  const boot = () => {
    const w = world ?? buildWorld();
    world = w;
    const map = new MapView(canvas, w);
    map.layers = { cameras: true, sensors: false, cctv: false, traffic: true, phones: false };
    const resize = () => {
      map.resize();
      map.fit();
      map.zoomBy(1.15);
    };
    new ResizeObserver(resize).observe(canvas);
    resize();
    let now = at(TODAY, 8, 10);
    let last = performance.now();
    const loop = (t: number) => {
      if (!canvas.isConnected) return;
      now += ((t - last) / 1000) * (25 / 60);
      last = t;
      map.render(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    clear(stats);
    stats.append(
      stat(String(w.city.cameras.length), 'plate cameras'),
      stat(num(w.reads.filter((r) => r.t < at(TODAY, 14)).length), 'plate reads on file'),
      stat(num(w.people.filter(sharesLocation).length), 'phones selling their location'),
      stat(num(gallery(w, true).length), 'faces on file'),
      stat(String(w.city.sensors.length), 'gunshot sensors'),
    );
    start.disabled = false;
    free.disabled = false;
    start.focus();
  };
  window.setTimeout(boot, 30);
}

function stat(value: string, label: string): HTMLElement {
  return h('span', { class: 'title-stat' }, h('strong', null, value), ` ${label}`);
}

export function showAbout(): void {
  document.querySelector('.modal-backdrop')?.remove();
  const close = () => backdrop.remove();
  const backdrop = h(
    'div',
    { class: 'modal-backdrop', onclick: (e: Event) => { if (e.target === backdrop) close(); } },
    h(
      'div',
      { class: 'modal modal-wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'How Dragnet works' },
      h('div', { class: 'modal-head' }, h('h2', null, 'How Dragnet works, and what’s real'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, '✕')),
      h(
        'div',
        { class: 'modal-body prose' },
        h('h3', null, 'Made up'),
        h('p', null, 'Port Avery, its streets, its roughly 650 residents and visitors, their cars, phones, faces and posts, and every case in the shift. PANOPTIC is not a real product. Any resemblance of a simulated person to a real one is a coincidence.'),
        h('h3', null, 'Real'),
        h('p', null, 'The tools and what they do. Each case is modeled on documented events, and its lesson cites the reporting, court records or research behind it. When you finish the shift, the report lists every source.'),
        h('h3', null, 'Simulated, honestly'),
        h(
          'ul',
          null,
          h('li', null, 'Every resident has a month of days: work, errands, worship, the gym, a partner’s place on weekends. Plate reads, phone location points and gunshot alerts are generated from those days, so what the tools find is consistent: a car seen at 2:36 a.m. on the bridge is really on the bridge.'),
          h('li', null, 'Plate readers misread characters that look alike. Face recognition ranks a gallery by similarity of 64-number face vectors; blurry stills add noise. Gunshot sensors classify loud bangs with overlapping score distributions. The forecast learns from what it records.'),
          h('li', null, 'Real systems are larger and messier: Port Avery has 30 plate cameras; Flock’s network has about 120,000.'),
        ),
        h('h3', null, 'Your privacy'),
        h('p', null, 'The simulation runs entirely in your browser. Nothing you type is sent anywhere. The site may count page views without cookies.'),
      ),
    ),
  );
  document.body.append(backdrop);
}

/** The console booting up, line by line. Click or press a key to skip. */
export function bootSequence(root: HTMLElement, world: World, done: () => void): void {
  clear(root);
  const posts = buildPosts(world).length;
  const lines: [string, string][] = [
    ['PANOPTIC Public Safety Cloud 7.4.2 · Port Avery Police Department', ''],
    ['Authenticating analyst #4471', 'OK'],
    [`Plate reader network: ${world.city.cameras.length} cameras, ${num(world.reads.filter((r) => r.t < at(TODAY, 14)).length)} reads, 30-day retention`, 'OK'],
    ['Shared networks: 4,812 agencies nationwide', 'OK'],
    [`Commercial location feed: ${num(world.people.filter(sharesLocation).length)} devices`, 'OK'],
    [`Face gallery: ${num(gallery(world, true).length)} booking and driver’s license photos`, 'OK'],
    [`Cell-site simulator unit 3`, 'STANDBY'],
    [`Acoustic sensor array: ${world.city.sensors.length} sensors`, 'OK'],
    [`Social media monitor: ${posts} public posts this week`, 'OK'],
    ['Predictive patrol model, trained on 2025 arrest records', 'LOADED'],
    ['Audit logging', 'ON · reviews in last 12 months: 0'],
    ['Shift begins 14:00. Welcome, analyst.', ''],
  ];
  const log = h('div', { class: 'boot-log', role: 'log', 'aria-live': 'polite' });
  const skip = h('p', { class: 'boot-skip' }, 'Click or press any key to skip');
  const screen = h('div', { class: 'boot' }, log, skip);
  root.append(screen);
  let k = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.removeEventListener('keydown', finish);
    done();
  };
  screen.addEventListener('click', finish);
  window.addEventListener('keydown', finish);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tick = () => {
    if (finished) return;
    const line = lines[k++];
    if (!line) {
      window.setTimeout(finish, 650);
      return;
    }
    const [text, status] = line;
    log.append(
      h(
        'div',
        { class: 'boot-line' },
        h('span', null, text),
        status ? h('span', { class: 'boot-dots', 'aria-hidden': 'true' }) : null,
        status ? h('span', { class: status === 'OK' || status === 'LOADED' ? 'boot-ok' : 'boot-warn' }, status) : null,
      ),
    );
    window.setTimeout(tick, reduce ? 40 : 150 + Math.random() * 140);
  };
  tick();
}
