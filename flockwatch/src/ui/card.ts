/**
 * The card for one camera. Who answers for it comes first, since that is what
 * someone can act on; then how it sees your route, which way it points, and
 * who paid for and runs it. Hovering shows a short version; clicking or
 * tapping pins the full card so its links can be used.
 */

import type { CountyBoard } from '../lib/boards';
import { osmLinks, type Camera } from '../lib/camera';
import { describeDirection, parseDirection } from '../lib/direction';
import { fmtMiles } from '../lib/format';
import { fundingRows, type FundingRow } from '../lib/funding';
import { lookupResponsible, type Official, type Responsible } from '../lib/officials';
import { describeVerdict, isCounted, type Sighting } from '../lib/seen';
import { boardButton, boardDetails, bodyButton, contactButtons, lowerFirst } from './contact';
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
    const pinned = this.pinned;
    const brand = camera.brand ? `${camera.brand} camera` : 'Plate reader, maker not recorded';

    fill(
      this.el,
      h(
        'div',
        { class: 'card-top' },
        h('p', { class: 'card-brand', 'data-kind': camera.flock ? 'flock' : 'other' }, brand),
        h('button', { type: 'button', class: 'card-close', 'aria-label': 'Close', onclick: () => this.close() }, '×'),
      ),
      s
        ? h(
            'p',
            { class: 'card-verdict', 'data-counted': String(isCounted(s.verdict)) },
            h('strong', null, `${fmtMiles(s.along)} into your drive. `),
            describeVerdict(s.verdict),
          )
        : null,
      h(
        'div',
        { class: 'card-who' },
        h('h4', null, pinned ? 'Who answers for this camera' : 'Answers to'),
        pinned ? this.renderOfficials() : this.renderSummary(),
      ),
      pinned
        ? h(
            'div',
            { class: 'card-section' },
            h('h4', null, 'This camera'),
            h('p', { class: 'card-dir' }, describeDirection(cones)),
            h(
              'p',
              { class: 'card-op' },
              fundingRows(camera.operator, [camera.lon, camera.lat], camera.flock).map((row) => fundingRow(row)),
            ),
          )
        : h('p', { class: 'card-hint' }, 'Click the camera for how to reach them.'),
      pinned
        ? h(
            'p',
            { class: 'card-foot' },
            h('a', { href: links.view, target: '_blank', rel: 'noopener' }, `OpenStreetMap #${camera.id}`),
            h('a', { href: links.edit, target: '_blank', rel: 'noopener' }, 'Fix this camera'),
          )
        : null,
    );
  }

  /** The hover card's line: the place first, then everyone else in a few words. */
  private renderSummary(): Child[] {
    const o = this.officials;
    if (o.state !== 'done') return this.renderOfficials();
    const r = o.data;
    if (!r) return this.renderOfficials();
    const lead = leadOf(r);
    const parts: string[] = [];
    if (lead) parts.push(lead.official ? `${lead.official.role} and ${lowerFirst(lead.body)}` : lead.body);
    if (r.local && r.county) parts.push(r.county.label);
    if (r.state.length) {
      parts.push(
        r.jurisdiction.state.abbr === 'DC'
          ? `${r.state.length} ${r.state.length === 1 ? 'council member' : 'council members'}`
          : `${r.state.length} state ${r.state.length === 1 ? 'legislator' : 'legislators'}`,
      );
    }
    if (r.federal.length) parts.push(`${r.federal.length} ${r.federal.length === 1 ? 'member' : 'members'} of Congress`);
    if (!parts.length) return [h('p', { class: 'note' }, 'No officials found for this spot.')];
    return [lead ? h('p', { class: 'who-name' }, lead.label) : null, h('p', { class: 'who-meta' }, parts.join(', '))];
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
    const lead = leadOf(r);
    const about = { camera: this.camera ? osmLinks(this.camera).view : 'https://www.openstreetmap.org' };
    if (lead) {
      blocks.push(
        h('p', { class: 'who-name' }, lead.label),
        h(
          'p',
          { class: 'who-meta' },
          lead.official ? [h('strong', null, `${lead.official.role} ${lead.official.name}`), ' · '] : null,
          lead.body,
          lead.official?.url ? [' · ', h('a', { href: lead.official.url, target: '_blank', rel: 'noopener' }, 'Check on Wikidata')] : null,
        ),
        h('p', { class: 'who-why' }, `The ${lowerFirst(lead.body)} usually approves camera contracts like this one, and can cancel them.`),
        lead.board ? boardButton(lead.board, about, 'primary') : bodyButton(lead.body, lead.website, 'primary'),
        ...(lead.board ? boardDetails(lead.board) : []),
      );
    }

    const others: HTMLElement[] = [];
    if (r.local && r.county) {
      const { board } = r.county;
      others.push(
        board
          ? row(r.county.label, `${board.body} · ${board.members.map((m) => m.name).join(', ')}`, boardButton(board, about, 'small'))
          : row(r.county.label, [r.county.official ? `${r.county.official.role} ${r.county.official.name}` : '', r.county.body].filter(Boolean).join(' · '), bodyButton(r.county.body, r.county.website, 'small')),
      );
    }
    for (const p of [...r.state, ...r.federal]) others.push(personRow(p));
    if (others.length) blocks.push(h('div', { class: 'who-also' }, h('h4', null, lead ? 'Also answers for it' : 'Answers for it'), others));
    if (!blocks.length) blocks.push(h('p', { class: 'note' }, 'No officials found for this spot.'));
    return blocks;
  }
}

/** The government closest to the camera: its city or town, or its county on unincorporated land. */
function leadOf(r: Responsible): { label: string; body: string; official?: Official; website?: string; board?: CountyBoard } | null {
  if (r.local) return r.local;
  if (r.county) return { ...r.county, label: `${r.county.label} (unincorporated)` };
  return null;
}

function fundingRow(row: FundingRow): HTMLElement {
  return h(
    'span',
    { class: 'op-row' },
    `${row.label}: `,
    row.name ? h('strong', null, row.name) : 'unknown',
    row.kind ? [' ', h('span', { class: 'op-kind' }, row.kind)] : null,
    row.how ? `, ${row.how}` : null,
    row.source ? [' · ', h('a', { href: row.source, target: '_blank', rel: 'noopener' }, 'source')] : null,
  );
}

function row(name: string, meta: string, actions: HTMLElement | null): HTMLElement {
  return h('div', { class: 'who-row' }, h('span', { class: 'who-row-name' }, h('strong', null, name), meta ? h('span', null, meta) : null), actions);
}

function personRow(p: Official): HTMLElement {
  const district = p.district && !p.role.startsWith('U.S. senator') ? (/^\d/.test(p.district) ? `District ${p.district}` : p.district) : '';
  return row(`${p.name}${p.party ? ` (${p.party})` : ''}`, [p.role, district].filter(Boolean).join(' · '), contactButtons(p));
}
