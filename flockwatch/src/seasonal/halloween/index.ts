/*
 * Halloween decorations: cobwebs in two corners, a pumpkin in the logo and
 * favicon, and a spider that drops down its thread on page load, takes a
 * photo with a flash, and climbs back up.
 *
 * Everything lives in this folder and is switched on by one call in main.ts.
 * The styles only apply under `html.halloween`, which this module adds, and
 * every element it adds is decoration: hidden from screen readers and never
 * in the way of a click. To take it all down, delete this folder,
 * tests/halloween.test.ts, and the import and call in src/main.ts.
 */
import './halloween.css';
import faviconUrl from './favicon.svg?url';
import { h } from '../../ui/dom';
import { isHalloweenSeason } from './season';

const SVG = 'http://www.w3.org/2000/svg';

function svg(tag: string, attrs: Record<string, string | number>, ...children: SVGElement[]): SVGElement {
  const el = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  el.append(...children);
  return el;
}

/** A corner web: spokes fanning out from the corner, joined by threads that sag toward it. */
function webPath(size = 150, spokes = 7, rings = [28, 55, 82, 110, 138]): string {
  const angles = Array.from({ length: spokes }, (_, i) => ((Math.PI / 2) * i) / (spokes - 1));
  const at = (r: number, a: number) => [r * Math.cos(a), r * Math.sin(a)].map((n) => n.toFixed(1)).join(' ');
  const d = angles.map((a) => `M0 0L${at(size, a)}`);
  for (const r of rings) {
    let ring = `M${at(r, angles[0]!)}`;
    for (let i = 1; i < angles.length; i++) {
      const mid = (angles[i - 1]! + angles[i]!) / 2;
      const chord = r * Math.cos((angles[i]! - angles[i - 1]!) / 2);
      ring += `Q${at(chord * 0.86, mid)} ${at(r, angles[i]!)}`;
    }
    d.push(ring);
  }
  return d.join('');
}

function web(where: string): SVGElement {
  return svg('svg', { class: `hw-web ${where}`, viewBox: '0 0 150 150', 'aria-hidden': 'true' }, svg('path', { d: webPath() }));
}

/** A jack-o'-lantern drawn in a 32-unit box, centred on (16, 19). */
function pumpkin(transform: string): SVGElement {
  return svg(
    'g',
    { class: 'hw-pumpkin', transform },
    svg('path', { class: 'hw-pumpkin-stem', d: 'M15 9c0-3 1-5 4-6l1 2c-2 1-3 2-3 4z' }),
    svg('ellipse', { class: 'hw-pumpkin-body', cx: 10.5, cy: 19, rx: 7, ry: 9 }),
    svg('ellipse', { class: 'hw-pumpkin-body', cx: 21.5, cy: 19, rx: 7, ry: 9 }),
    svg('ellipse', { class: 'hw-pumpkin-body hw-pumpkin-front', cx: 16, cy: 19, rx: 7.5, ry: 10 }),
    svg('path', {
      class: 'hw-pumpkin-face',
      d: 'M10 16l3 3h-4zM22 16l1 3h-4zM9.5 22q6.5 5 13 0l-2 1-1-1-2 1.5-1.5-1.5-1.5 1.5-2-1.5-1 1z',
    }),
  );
}

/** A spider hanging head down, holding a camera pointed at the map. (0, 0) is where the thread meets it. */
function spider(): SVGElement {
  const leg = (d: string) => svg('path', { d });
  const legs = svg(
    'g',
    { class: 'hw-spider-legs' },
    leg('M-3 11C-9 7-13 5-15 0'),
    leg('M-4 14C-10 13-15 13-17 17'),
    leg('M-4 17C-9 20-12 24-13 29'),
    leg('M-3 21C-7 25-8 28-6 30'),
    leg('M3 11C9 7 13 5 15 0'),
    leg('M4 14C10 13 15 13 17 17'),
    leg('M4 17C9 20 12 24 13 29'),
    leg('M3 21C7 25 8 28 6 30'),
  );
  const rays = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) =>
    svg('line', { x1: 0, y1: 6, x2: 0, y2: 11, transform: `rotate(${deg})` }),
  );
  return svg(
    'svg',
    { class: 'hw-spider-body', viewBox: '-20 0 40 54', 'aria-hidden': 'true' },
    legs,
    svg('ellipse', { class: 'hw-spider-ink', cx: 0, cy: 10, rx: 6.5, ry: 7.5 }),
    svg('circle', { class: 'hw-spider-ink', cx: 0, cy: 20, r: 4 }),
    svg('rect', { class: 'hw-camera', x: -6, y: 27, width: 12, height: 8, rx: 1.6 }),
    svg('rect', { class: 'hw-camera', x: -2.5, y: 25.5, width: 5, height: 2.2, rx: 0.6 }),
    svg('circle', { class: 'hw-lens', cx: 0, cy: 35.5, r: 2.6 }),
    svg('g', { class: 'hw-flash', transform: 'translate(0 40)' }, svg('circle', { r: 4 }), ...rays),
  );
}

export function startHalloween(now = new Date()): void {
  if (!isHalloweenSeason(now)) return;
  document.documentElement.classList.add('halloween');

  document.querySelector('.panel')?.append(web('hw-web-panel'));

  const map = document.querySelector('.map-wrap');
  if (map) {
    map.append(
      web('hw-web-map'),
      h('div', { class: 'hw-flash-wash', 'aria-hidden': 'true' }),
      h('div', { class: 'hw-spider', 'aria-hidden': 'true' }, h('div', { class: 'hw-thread' }), spider()),
    );
    // The spider's run starts once the map is on screen: at once on wide
    // screens, and when it's scrolled to on phones, where it sits below the form.
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        map.classList.add('hw-go');
        seen.disconnect();
      },
      { threshold: 0.5 },
    );
    seen.observe(map);
  }

  document.querySelector('.brand-mark')?.append(pumpkin('translate(11 22.5) scale(.6) translate(-16 -19)'));
  document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute('href', faviconUrl);
}
