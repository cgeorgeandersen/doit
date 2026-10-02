/**
 * The card for one camera: what it is, which way it points, how it sees your
 * route, and who answers for it. Hovering shows it briefly; clicking or
 * tapping pins it so its links can be used.
 */

import { osmLinks, type Camera } from '../lib/camera';
import { describeDirection, parseDirection } from '../lib/direction';
import { fmtMiles } from '../lib/format';
import { lookupResponsible, type Official, type Responsible } from '../lib/officials';
import { describeVerdict, isCounted, type Sighting } from '../lib/seen';
import { fill, h, type Child } from './dom';

type Pt = { x: number; y: number };
type Officials = { state: 'idle' } | { state: 'loading' } | { state: 'error' } | { state: 'done'; data: Responsible | null };

const OFFICIALS_DELAY_MS = 280;

export class CameraCard {
  camera: Camera | null = null;
  pinned = false;
  private readonly el: HTMLElement;
  private readonly area: HTMLElement;
  private readonly onClose: () => void;
  private sighting: Sighting | null = null;
  private officials: Officials = { state: 'idle' };
  private timer = 0;
  private at: Pt = { x: 0, y: 0 };

  constructor(el: HTMLElement, area: HTMLElement, onClose: () => void) {
    this.el = el;
    this.area = area;
    this.onClose = onClose;
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  /** Shows the card for `camera` at a point inside the map; null hides an unpinned card. */
  hover(camera: Camera | null, sighting: Sighting | null, at: Pt): void {
    if (this.pinned) return;
    if (!camera) return this.hide();
    this.at = at;
    if (camera.id !== this.camera?.id) {
      this.load(camera, sighting, false);
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.fetchOfficials(camera), OFFICIALS_DELAY_MS);
    }
    this.place();
  }

  pin(camera: Camera, sighting: Sighting | null, at: Pt): void {
    this.at = at;
    if (camera.id !== this.camera?.id || !this.pinned) this.load(camera, sighting, true);
    this.fetchOfficials(camera);
    this.place();
    this.el.querySelector<HTMLElement>('.card-close')?.focus({ preventScroll: true });
  }

  /** Keeps a pinned card beside its camera while the map moves. */
  follow(at: Pt): void {
    this.at = at;
    if (!this.el.hidden) this.place();
  }

  close(): void {
    const wasPinned = this.pinned;
    this.hide();
    if (wasPinned) this.onClose();
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.camera = null;
    this.pinned = false;
    this.el.hidden = true;
    this.el.removeAttribute('data-pinned');
  }

  private load(camera: Camera, sighting: Sighting | null, pinned: boolean): void {
    if (camera.id !== this.camera?.id) this.officials = { state: 'idle' };
    this.camera = camera;
    this.sighting = sighting;
    this.pinned = pinned;
    this.el.toggleAttribute('data-pinned', pinned);
    this.el.setAttribute('role', pinned ? 'dialog' : 'tooltip');
    this.el.setAttribute('aria-label', `${camera.brand || 'License plate'} camera`);
    this.render();
    this.el.hidden = false;
  }

  private fetchOfficials(camera: Camera): void {
    if (this.officials.state === 'loading' || this.officials.state === 'done') return;
    this.officials = { state: 'loading' };
    this.render();
    const id = camera.id;
    const update = (o: Officials) => {
      if (this.camera?.id !== id) return;
      this.officials = o;
      this.render();
      this.place();
    };
    lookupResponsible(camera.lon, camera.lat, (partial) => update({ state: 'done', data: partial }))
      .then((data) => update({ state: 'done', data }))
      .catch(() => update({ state: 'error' }));
  }

  private place(): void {
    if (this.el.hidden) return;
    if (this.pinned && window.matchMedia('(max-width: 959px)').matches) {
      this.el.style.left = '';
      this.el.style.top = '';
      return;
    }
    const pad = 12;
    const offset = 18;
    const W = this.area.clientWidth;
    const H = this.area.clientHeight;
    const w = this.el.offsetWidth;
    const hgt = this.el.offsetHeight;
    let x = this.at.x + offset;
    if (x + w + pad > W) x = this.at.x - offset - w;
    x = Math.max(pad, Math.min(x, W - w - pad));
    let y = this.at.y - 24;
    if (y + hgt + pad > H) y = H - hgt - pad;
    y = Math.max(pad, y);
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  private render(): void {
    const camera = this.camera;
    if (!camera) return;
    const cones = parseDirection(camera.direction);
    const links = osmLinks(camera);
    const s = this.sighting;
    const brand = camera.brand ? `${camera.brand} · plate reader` : 'Plate reader · maker not recorded';

    fill(
      this.el,
      h(
        'div',
        { class: 'card-top' },
        h(
          'div',
          null,
          h('p', { class: 'card-brand', 'data-kind': camera.flock ? 'flock' : 'other' }, brand),
          h('h3', null, describeDirection(cones)),
        ),
        h('button', { type: 'button', class: 'card-close', 'aria-label': 'Close', onclick: () => this.close() }, '×'),
      ),
      h(
        'p',
        { class: 'card-op' },
        camera.operator ? ['Run by ', h('strong', null, camera.operator)] : 'Who runs it isn’t recorded.',
      ),
      s
        ? h(
            'p',
            { class: 'card-verdict', 'data-counted': String(isCounted(s.verdict)) },
            h('strong', null, `${fmtMiles(s.along)} into your drive. `),
            describeVerdict(s.verdict),
          )
        : null,
      h('div', { class: 'card-section' }, h('h4', null, 'Who answers for it'), this.renderOfficials()),
      h('p', { class: 'card-hint' }, 'Click the camera for contact details.'),
      h(
        'p',
        { class: 'card-foot' },
        h('a', { href: links.view, target: '_blank', rel: 'noopener' }, `OpenStreetMap #${camera.id}`),
        h('a', { href: links.edit, target: '_blank', rel: 'noopener' }, 'Fix this camera'),
      ),
    );
  }

  private renderOfficials(): Child[] {
    const o = this.officials;
    if (o.state === 'idle' || o.state === 'loading') {
      return [h('span', { class: 'skeleton', style: 'width: 70%' }), h('span', { class: 'skeleton', style: 'width: 55%' }), h('span', { class: 'skeleton', style: 'width: 62%' })];
    }
    if (o.state === 'error') {
      return [
        h(
          'p',
          { class: 'note' },
          'Couldn’t look up officials right now. ',
          h('a', { href: 'https://www.usa.gov/elected-officials', target: '_blank', rel: 'noopener' }, 'Find your elected officials'),
          '.',
        ),
      ];
    }
    const r = o.data;
    if (!r) return [h('p', { class: 'note' }, 'This camera is outside the United States.')];

    const blocks: Child[] = [];
    const pinned = this.pinned;
    if (r.local) {
      blocks.push(
        h(
          'div',
          { class: 'gov' },
          h('span', { class: 'gov-area' }, r.local.label),
          r.local.official ? person(r.local.official, pinned) : null,
          h('span', { class: 'person' }, h('span', { class: 'role' }, r.local.body), pinned && r.local.website ? contactLink(r.local.website, 'Website') : null),
        ),
      );
    }
    if (r.county) {
      blocks.push(
        h(
          'div',
          { class: 'gov' },
          h('span', { class: 'gov-area' }, r.local ? r.county.label : `${r.county.label} (unincorporated)`),
          r.county.official ? person(r.county.official, pinned) : null,
          h('span', { class: 'person' }, h('span', { class: 'role' }, r.county.body), pinned && r.county.website ? contactLink(r.county.website, 'Website') : null),
        ),
      );
    }
    if (r.state.length) {
      const label = r.jurisdiction.state.abbr === 'DC' ? 'D.C. Council' : `${r.jurisdiction.state.name} legislature`;
      blocks.push(h('div', { class: 'gov' }, h('span', { class: 'gov-area' }, label), r.state.map((p) => person(p, pinned))));
    }
    if (r.federal.length) {
      const house = r.federal.filter((p) => !p.role.includes('senator'));
      const senators = r.federal.filter((p) => p.role.includes('senator'));
      blocks.push(
        h(
          'div',
          { class: 'gov' },
          h('span', { class: 'gov-area' }, 'Congress'),
          house.map((p) => person(p, pinned)),
          pinned
            ? senators.map((p) => person(p, pinned))
            : senators.length
              ? h(
                  'span',
                  { class: 'person' },
                  h('span', { class: 'role' }, 'U.S. senators'),
                  h('span', { class: 'who' }, senators.map((p) => `${p.name}${p.party ? ` (${p.party})` : ''}`).join(', ')),
                )
              : null,
        ),
      );
    }
    if (!blocks.length) blocks.push(h('p', { class: 'note' }, 'No officials found for this spot.'));
    return blocks;
  }
}

function person(p: Official, withContact: boolean): HTMLElement {
  const meta = [p.party, p.district && !p.role.startsWith('U.S. senator') ? (/^\d/.test(p.district) ? `District ${p.district}` : p.district) : '']
    .filter(Boolean)
    .join(' · ');
  return h(
    'span',
    { class: 'person' },
    h('span', { class: 'role' }, p.role),
    h('span', { class: 'who' }, p.name),
    meta ? h('span', null, meta) : null,
    withContact ? contact(p) : null,
  );
}

function contactLink(href: string, text: string): HTMLElement {
  return h('span', { class: 'contact' }, h('a', { href, target: '_blank', rel: 'noopener' }, text));
}

function contact(p: Official): HTMLElement | null {
  const links: HTMLElement[] = [];
  if (p.email) links.push(h('a', { href: `mailto:${p.email}` }, 'Email'));
  if (p.phone) links.push(h('a', { href: `tel:${p.phone.replace(/[^\d+]/g, '')}` }, p.phone));
  const label = p.source === 'congress-legislators' ? 'Contact' : p.source === 'Wikidata' ? 'Check on Wikidata' : 'Profile';
  if (p.url) links.push(h('a', { href: p.url, target: '_blank', rel: 'noopener' }, label));
  return links.length ? h('span', { class: 'contact' }, links) : null;
}
