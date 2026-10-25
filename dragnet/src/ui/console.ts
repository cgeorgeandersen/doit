/**
 * The console: top bar, tool rail, map, side panel and the live feed along
 * the bottom of the map. Tools mount into the panel; the story's case card
 * sits above them.
 */
import { onHotlist } from '../core/alpr';
import type { ToolId } from '../core/audit';
import { type Place } from '../core/city';
import { fullName, homeOn, type Person, vehicleLabel } from '../core/people';
import { dayOf, fmtClock, fmtDate, fmtDateTime, fmtTime, MIN_PER_DAY, TODAY } from '../core/time';
import { type Read, readsFrom } from '../core/world';
import { ANALYST, type App } from './app-state';
import { clear, h, type IconName, num, plural, svgIcon } from './dom';
import { type Hit, type Layers, MapView } from './map';
import { captureCanvas } from './plate';
import { blip } from './sound';

export interface Tool {
  id: ToolId;
  name: string;
  short: string;
  icon: IconName;
  mount(el: HTMLElement, args?: unknown): void;
  unmount?(): void;
  /** Map taps while this tool is open; return true if handled. */
  onHit?(hit: Hit): boolean;
  layers?: Partial<Layers>;
}

export type ToolFactory = (c: Console) => Tool;

export class Console {
  readonly app: App;
  readonly root: HTMLElement;
  map!: MapView;
  tools = new Map<ToolId, Tool>();
  current: Tool | null = null;
  private panel!: HTMLElement;
  private toolHost!: HTMLElement;
  caseHost!: HTMLElement;
  private rail!: HTMLElement;
  private clockEl!: HTMLElement;
  private dateEl!: HTMLElement;
  private touchedEl!: HTMLElement;
  private searchesEl!: HTMLElement;
  private ticker!: HTMLElement;
  private toasts!: HTMLElement;
  private popover!: HTMLElement;
  private mapWrap!: HTMLElement;
  private speedButtons: HTMLButtonElement[] = [];
  private pauseButton!: HTMLButtonElement;
  private soundButton!: HTMLButtonElement;
  private tickerQueue: Read[] = [];
  private lastTickerFlush = 0;
  private raf = 0;
  private last = 0;
  /** Seen hotlist hits, so each fires once. */
  private hitReads = new Set<Read>();
  onEndShift: (() => void) | null = null;
  /** Story mode can freeze the clock while a case is being read. */
  clockHold = false;

  constructor(root: HTMLElement, app: App, factories: ToolFactory[]) {
    this.root = root;
    this.app = app;
    this.build();
    for (const f of factories) {
      const tool = f(this);
      this.tools.set(tool.id, tool);
    }
    this.buildRail();
    this.app.audit.onChange(() => this.updateCounters());
    this.updateCounters();
  }

  private build(): void {
    const app = this.app;
    this.clockEl = h('span', { class: 'clock-time' }, fmtClock(app.now));
    this.dateEl = h('span', { class: 'clock-date' }, fmtDate(dayOf(app.now)));
    this.touchedEl = h('strong', null, '0');
    this.searchesEl = h('span', null, '0 searches');
    this.pauseButton = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Pause the clock', onclick: () => this.togglePause() }, svgIcon('pause', 16));
    const speeds = app.mode === 'story' ? [6, 30] : [1, 10, 60, 300];
    this.speedButtons = speeds.map((s) =>
      h('button', { class: 'speed', type: 'button', 'data-speed': s, 'aria-pressed': String(s === app.speed), onclick: () => this.setSpeed(s) }, `${s}×`),
    );
    this.soundButton = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sound off', onclick: () => this.toggleSound() }, svgIcon('sound', 16));
    const top = h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '◉'), h('span', { class: 'brand-name' }, 'PANOPTIC'), h('span', { class: 'brand-sub' }, 'Real-Time Crime Center · Port Avery PD')),
      h('div', { class: 'clock', role: 'timer', 'aria-label': 'Simulation time' }, this.dateEl, this.clockEl),
      h('div', { class: 'speeds', role: 'group', 'aria-label': 'Clock speed' }, this.pauseButton, ...this.speedButtons),
      h(
        'button',
        { class: 'touched', type: 'button', onclick: () => this.openAudit(), title: 'Open the audit log' },
        h('span', { class: 'touched-label' }, 'People in your searches'),
        this.touchedEl,
        h('span', { class: 'touched-sub' }, this.searchesEl, ' · audit log'),
      ),
      h('div', { class: 'top-actions' }, this.soundButton, h('button', { class: 'end-shift', type: 'button', onclick: () => this.onEndShift?.() }, app.mode === 'story' ? 'End shift' : 'Exit')),
    );
    this.rail = h('nav', { class: 'rail', 'aria-label': 'Tools' });
    const canvas = h('canvas', { class: 'map-canvas', 'aria-label': 'Map of Port Avery. Cameras, sensors and moving cars are drawn on it; every tool also lists its results in the panel.' });
    this.ticker = h('div', { class: 'ticker', 'aria-live': 'off' }, h('span', { class: 'ticker-label' }, 'LIVE PLATE READS'));
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'assertive' });
    this.popover = h('div', { class: 'popover', hidden: true });
    const zoom = h(
      'div',
      { class: 'map-zoom' },
      h('button', { type: 'button', 'aria-label': 'Zoom in', onclick: () => this.map.zoomBy(1.4) }, '+'),
      h('button', { type: 'button', 'aria-label': 'Zoom out', onclick: () => this.map.zoomBy(1 / 1.4) }, '−'),
      h('button', { type: 'button', 'aria-label': 'Show the whole city', onclick: () => this.map.fit() }, '⤢'),
    );
    const legend = h(
      'div',
      { class: 'map-legend' },
      h('span', null, h('i', { class: 'lg lg-cam' }), 'Plate camera'),
      h('span', null, h('i', { class: 'lg lg-sensor' }), 'Gunshot sensor'),
      h('span', null, h('i', { class: 'lg lg-cctv' }), 'CCTV'),
      h('span', null, h('i', { class: 'lg lg-phone' }), 'Phone'),
    );
    this.mapWrap = h('div', { class: 'map-wrap' }, canvas, zoom, legend, this.toasts, this.popover, this.ticker);
    this.caseHost = h('div', { class: 'case-host' });
    this.toolHost = h('div', { class: 'tool-host' });
    this.panel = h('aside', { class: 'panel' }, this.caseHost, this.toolHost);
    clear(this.root);
    this.root.append(h('div', { class: `console mode-${app.mode}` }, top, this.rail, this.mapWrap, this.panel));
    this.map = new MapView(canvas, app.world);
    this.map.onHit = (hit, sx, sy) => this.handleHit(hit, sx, sy);
    new ResizeObserver(() => this.map.resize()).observe(canvas);
    this.map.resize();
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closePopover();
        document.querySelector('.modal-backdrop')?.remove();
      }
    });
  }

  private buildRail(): void {
    clear(this.rail);
    for (const tool of this.tools.values()) {
      this.rail.append(
        h(
          'button',
          { class: 'rail-btn', type: 'button', 'data-tool': tool.id, 'aria-pressed': 'false', onclick: () => this.open(tool.id), title: tool.name },
          svgIcon(tool.icon, 22),
          h('span', null, tool.short),
        ),
      );
    }
  }

  open(id: ToolId, args?: unknown): void {
    const tool = this.tools.get(id);
    if (!tool) return;
    this.current?.unmount?.();
    this.map.overlays.clear();
    this.map.mode = 'pan';
    this.map.rectDraft = null;
    this.map.onRect = null;
    this.map.onPoint = null;
    this.map.layers = { cameras: true, sensors: false, cctv: false, traffic: true, phones: false, ...tool.layers };
    this.map.highlight.clear();
    this.current = tool;
    clear(this.toolHost);
    tool.mount(this.toolHost, args);
    for (const b of this.rail.querySelectorAll<HTMLButtonElement>('.rail-btn')) b.setAttribute('aria-pressed', String(b.dataset.tool === id));
    this.closePopover();
    this.toolHost.scrollTop = 0;
    this.app.emit('tool', { tool: id });
  }

  pulseTool(id: ToolId | null): void {
    for (const b of this.rail.querySelectorAll<HTMLButtonElement>('.rail-btn')) b.classList.toggle('pulse', b.dataset.tool === id);
  }

  start(): void {
    this.last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.25, (t - this.last) / 1000);
      this.last = t;
      if (!this.app.paused && !this.clockHold) this.advance((dt * this.app.speed) / 60);
      this.map.render(this.app.now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  /** Moves the clock forward by `minutes`, delivering every plate read in between. */
  advance(minutes: number): void {
    const prev = this.app.now;
    const end = Math.min((TODAY + 1) * MIN_PER_DAY - 1, prev + minutes);
    if (end <= prev) return;
    this.app.now = end;
    const reads = this.app.world.reads;
    for (let k = readsFrom(this.app.world, prev); k < reads.length; k++) {
      const r = reads[k] as Read;
      if (r.t > end) break;
      if (r.t <= prev) continue;
      this.map.flashes.set(r.camera, r.t);
      this.app.emit('read', { read: r });
      this.tickerQueue.push(r);
      const entry = onHotlist(this.app.hotlist, r);
      if (entry && !this.hitReads.has(r)) {
        this.hitReads.add(r);
        this.app.emit('hotlist-hit', { read: r, entry });
        this.hotlistToast(r);
      }
    }
    this.app.emit('tick', { now: end, prev });
    this.updateClock();
    const real = performance.now();
    if (real - this.lastTickerFlush > 300) {
      this.lastTickerFlush = real;
      this.flushTicker();
    }
  }

  /** Jumps the clock (story mode, between cases) without replaying the feed. */
  jumpTo(t: number): void {
    if (t <= this.app.now) return;
    const prev = this.app.now;
    this.app.now = t;
    this.tickerQueue = [];
    clear(this.toasts);
    this.app.emit('tick', { now: t, prev });
    this.updateClock();
  }

  private updateClock(): void {
    this.clockEl.textContent = fmtClock(this.app.now);
    this.dateEl.textContent = fmtDate(dayOf(this.app.now));
  }

  private flushTicker(): void {
    const items = this.tickerQueue.splice(0).slice(-6);
    for (const r of items) {
      const v = this.app.world.vehicles[r.vehicle];
      const cam = this.app.world.city.cameras[r.camera];
      if (!v || !cam) continue;
      const hit = onHotlist(this.app.hotlist, r);
      const item = h(
        'button',
        { class: `tick${hit ? ' tick-hit' : ''}`, type: 'button', onclick: () => this.showCapture(r) },
        h('span', { class: 'tick-time' }, fmtClock(r.t)),
        h('span', { class: 'tick-plate' }, r.text),
        h('span', { class: 'tick-where' }, cam.name),
      );
      this.ticker.insertBefore(item, this.ticker.children[1] ?? null);
    }
    while (this.ticker.children.length > 18) this.ticker.lastChild?.remove();
  }

  private hotlistToast(r: Read): void {
    const entry = onHotlist(this.app.hotlist, r);
    const cam = this.app.world.city.cameras[r.camera];
    if (!entry || !cam) return;
    if (this.app.soundOn) blip('hit');
    this.toast(
      h(
        'div',
        { class: 'toast-body' },
        h('strong', null, 'HOTLIST HIT'),
        h('span', { class: 'mono' }, `${r.text} · ${cam.name} · ${fmtTime(r.t)}`),
        h('span', null, entry.reason),
      ),
      'danger',
      [{ label: 'View capture', run: () => this.showCapture(r) }],
      14000,
    );
  }

  toast(body: Node | string, kind: 'info' | 'warn' | 'danger' = 'info', actions: { label: string; run: () => void }[] = [], ms = 6000): void {
    const el = h(
      'div',
      { class: `toast toast-${kind}`, role: 'status' },
      typeof body === 'string' ? h('div', { class: 'toast-body' }, body) : body,
      actions.length
        ? h('div', { class: 'toast-actions' }, ...actions.map((a) => h('button', { type: 'button', onclick: () => { a.run(); el.remove(); } }, a.label)))
        : null,
      h('button', { class: 'toast-close', type: 'button', 'aria-label': 'Dismiss', onclick: () => el.remove() }, svgIcon('close', 14)),
    );
    this.toasts.prepend(el);
    while (this.toasts.children.length > 3) this.toasts.lastChild?.remove();
    window.setTimeout(() => el.remove(), ms);
  }

  setSpeed(s: number): void {
    this.app.speed = s;
    this.app.paused = false;
    for (const b of this.speedButtons) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === s));
    this.pauseButton.replaceChildren(svgIcon('pause', 16));
    this.pauseButton.setAttribute('aria-label', 'Pause the clock');
  }

  togglePause(): void {
    this.app.paused = !this.app.paused;
    this.pauseButton.replaceChildren(svgIcon(this.app.paused ? 'play' : 'pause', 16));
    this.pauseButton.setAttribute('aria-label', this.app.paused ? 'Start the clock' : 'Pause the clock');
    for (const b of this.speedButtons) b.setAttribute('aria-pressed', String(!this.app.paused && Number(b.dataset.speed) === this.app.speed));
  }

  private toggleSound(): void {
    this.app.soundOn = !this.app.soundOn;
    this.soundButton.replaceChildren(svgIcon(this.app.soundOn ? 'sound' : 'mute', 16));
    this.soundButton.setAttribute('aria-label', this.app.soundOn ? 'Sound off' : 'Sound on');
  }

  private updateCounters(): void {
    this.touchedEl.textContent = num(this.app.audit.touched.size);
    const mine = this.app.audit.byUser(ANALYST).length;
    this.searchesEl.textContent = plural(mine, 'search', 'searches');
    this.touchedEl.parentElement?.classList.remove('bump');
    void this.touchedEl.parentElement?.offsetWidth;
    this.touchedEl.parentElement?.classList.add('bump');
  }

  // ---------------------------------------------------------------------------
  // Shared panels and widgets

  /** The "reason for search" box every query requires. It accepts anything. */
  reasonField(placeholder = 'Required. A word or two.'): { el: HTMLElement; value(): string; check(): boolean } {
    const input = h('input', { class: 'input', type: 'text', placeholder, maxlength: 80, 'aria-label': 'Reason for search', value: '' });
    const chips = ['investigation', 'inv', 'see case', 'welfare check'];
    const err = h('span', { class: 'field-error', hidden: true }, 'A reason is required. Anything will do.');
    const el = h(
      'div',
      { class: 'field reason' },
      h('label', { class: 'label' }, 'Reason for search'),
      input,
      h('div', { class: 'chips' }, ...chips.map((c) => h('button', { class: 'chip', type: 'button', onclick: () => { input.value = c; err.hidden = true; } }, c))),
      err,
    );
    input.addEventListener('input', () => (err.hidden = true));
    return {
      el,
      value: () => input.value.trim(),
      check: () => {
        const ok = input.value.trim().length > 0;
        err.hidden = ok;
        if (!ok) input.focus();
        return ok;
      },
    };
  }

  showCapture(r: Read): void {
    const w = this.app.world;
    const v = w.vehicles[r.vehicle];
    const cam = w.city.cameras[r.camera];
    if (!v || !cam) return;
    this.app.emit('capture-viewed', { read: r });
    const hot = onHotlist(this.app.hotlist, r);
    this.modal(
      `Capture · ${cam.name}`,
      h(
        'div',
        { class: 'capture' },
        captureCanvas(v, r, cam.name, Math.min(420, window.innerWidth - 64)),
        h(
          'dl',
          { class: 'facts' },
          h('div', null, h('dt', null, 'OCR read'), h('dd', { class: 'mono' }, `${r.text}`, h('span', { class: r.conf < 80 ? 'warn-text' : 'muted' }, ` (${r.conf}% confidence)`))),
          h('div', null, h('dt', null, 'Vehicle'), h('dd', null, `${v.color} ${v.type}${v.outOfState ? ', out-of-state plate' : ''}`)),
          h('div', null, h('dt', null, 'Features'), h('dd', null, v.features.length ? v.features.join(', ') : 'none detected')),
          h('div', null, h('dt', null, 'Time'), h('dd', null, fmtDateTime(r.t))),
          hot ? h('div', { class: 'hot' }, h('dt', null, 'Hotlist'), h('dd', null, `${hot.reason}. Listed vehicle: ${hot.description}.`)) : null,
        ),
      ),
    );
  }

  modal(title: string, body: Node, wide = false): HTMLElement {
    document.querySelector('.modal-backdrop')?.remove();
    const close = () => backdrop.remove();
    const backdrop = h(
      'div',
      { class: 'modal-backdrop', onclick: (e: Event) => { if (e.target === backdrop) close(); } },
      h(
        'div',
        { class: `modal${wide ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, svgIcon('close', 18))),
        h('div', { class: 'modal-body' }, body),
      ),
    );
    document.body.append(backdrop);
    (backdrop.querySelector('.modal-head button') as HTMLButtonElement).focus();
    return backdrop;
  }

  openAudit(): void {
    this.app.emit('audit-open', {});
    const entries = [...this.app.audit.entries].reverse();
    const touched = this.app.audit.touched.size;
    this.modal(
      'Audit log',
      h(
        'div',
        { class: 'audit' },
        h(
          'p',
          { class: 'audit-sum' },
          `${plural(entries.length, 'search', 'searches')} this shift, touching the records of `,
          h('strong', null, plural(touched, 'person', 'people')),
          '. Searches reviewed by a supervisor: ',
          h('strong', null, '0'),
          '.',
        ),
        entries.length === 0
          ? h('p', { class: 'muted' }, 'No searches yet.')
          : h(
              'table',
              { class: 'audit-table' },
              h('thead', null, h('tr', null, h('th', null, 'Time'), h('th', null, 'User'), h('th', null, 'Tool'), h('th', null, 'Query'), h('th', null, 'Reason given'), h('th', null, 'People'))),
              h(
                'tbody',
                null,
                ...entries.map((e) =>
                  h(
                    'tr',
                    { class: e.user === ANALYST ? '' : 'other-user' },
                    h('td', { class: 'mono' }, fmtTime(e.t)),
                    h('td', null, e.user),
                    h('td', null, this.tools.get(e.tool)?.name ?? e.tool),
                    h('td', { class: 'mono' }, e.query),
                    h('td', null, `“${e.reason}”`),
                    h('td', { class: 'mono' }, num(e.people.length)),
                  ),
                ),
              ),
            ),
        h(
          'p',
          { class: 'note' },
          'Plate reader systems log every search and the reason typed. In 2025 the Electronic Frontier Foundation went through more than 12 million logged searches and found reasons as thin as one word, among them “protest.” A log protects people only if someone reads it.',
        ),
      ),
      true,
    );
  }

  // ---------------------------------------------------------------------------
  // Map taps

  private handleHit(hit: Hit | null, sx: number, sy: number): void {
    if (hit && this.current?.onHit?.(hit)) return;
    if (!hit) {
      this.closePopover();
      return;
    }
    const w = this.app.world;
    let body: Node;
    if (hit.kind === 'vehicle') {
      const v = w.vehicles[hit.id];
      if (!v) return;
      body = h(
        'div',
        null,
        h('div', { class: 'pop-title mono' }, v.plate),
        h('div', { class: 'pop-sub' }, vehicleLabel(v)),
        h('div', { class: 'pop-actions' }, h('button', { class: 'btn btn-small', type: 'button', onclick: () => { this.closePopover(); this.open('plates', { plate: v.plate }); } }, 'Search this plate')),
      );
    } else if (hit.kind === 'camera') {
      const cam = w.city.cameras[hit.id];
      if (!cam) return;
      const start = dayOf(this.app.now) * MIN_PER_DAY;
      const today = w.reads.slice(readsFrom(w, start), readsFrom(w, this.app.now)).filter((r) => r.camera === cam.id).length;
      body = h(
        'div',
        null,
        h('div', { class: 'pop-title' }, `Plate camera ${String(cam.id + 1).padStart(2, '0')}`),
        h('div', { class: 'pop-sub' }, cam.name),
        h('div', { class: 'pop-stat' }, `${num(today)} plates read today`),
        h('div', { class: 'pop-actions' }, h('button', { class: 'btn btn-small', type: 'button', onclick: () => { this.closePopover(); this.open('plates', { camera: cam.id }); } }, 'See its reads')),
      );
    } else if (hit.kind === 'cctv') {
      const cam = w.city.cctv[hit.id];
      if (!cam) return;
      body = h(
        'div',
        null,
        h('div', { class: 'pop-title' }, 'CCTV camera'),
        h('div', { class: 'pop-sub' }, cam.name),
        h('div', { class: 'pop-stat' }, `Image quality ${Math.round(cam.quality * 100)}/100`),
        h('div', { class: 'pop-actions' }, h('button', { class: 'btn btn-small', type: 'button', onclick: () => { this.closePopover(); this.open('face', { cctv: cam.id }); } }, 'Pull stills for face search')),
      );
    } else if (hit.kind === 'place') {
      const place = w.city.places[hit.id] as Place;
      const residents = w.people.filter((p) => !p.hidden && p.resident && homeOn(p, dayOf(this.app.now)) === place.id);
      const isHome = place.kind === 'home' || place.kind === 'apartment' || place.kind === 'shelter';
      body = h(
        'div',
        null,
        h('div', { class: 'pop-title' }, place.kind === 'home' || place.kind === 'apartment' ? place.address : place.name),
        h('div', { class: 'pop-sub' }, `${place.kind === 'home' || place.kind === 'apartment' ? (place.kind === 'apartment' ? 'Apartment building' : 'House') : place.address} · ${place.district}`),
        place.confidential ? h('div', { class: 'pop-stat warn-text' }, 'Address confidential in county records') : null,
        h(
          'div',
          { class: 'pop-actions' },
          h('button', { class: 'btn btn-small', type: 'button', onclick: () => { this.closePopover(); this.open('location', { place: place.id }); } }, 'Geofence this place'),
          isHome && residents.length
            ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { this.closePopover(); this.residents(place, residents); } }, `Who lives here (${residents.length})`)
            : null,
        ),
      );
    } else {
      const s = w.city.sensors[hit.id];
      body = h('div', null, h('div', { class: 'pop-title' }, `Acoustic sensor ${hit.id + 1}`), h('div', { class: 'pop-sub' }, s ? 'Rooftop microphone array' : ''));
    }
    this.showPopover(body, sx, sy);
  }

  private residents(place: Place, people: Person[]): void {
    this.app.log('dossier', `residents of ${place.address}`, this.app.lastReason || 'address check', people.map((p) => p.id));
    this.modal(
      `Property and DMV records · ${place.address}`,
      h(
        'ul',
        { class: 'people-list' },
        ...people.map((p) =>
          h(
            'li',
            null,
            h('span', null, fullName(p), h('span', { class: 'muted' }, `, ${p.age}${p.unit ? `, ${p.unit}` : ''}`)),
            h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { document.querySelector('.modal-backdrop')?.remove(); this.open('dossier', { person: p.id }); } }, 'Dossier'),
          ),
        ),
      ),
    );
  }

  showPopover(body: Node, sx: number, sy: number): void {
    clear(this.popover);
    this.popover.append(h('button', { class: 'pop-close icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => this.closePopover() }, svgIcon('close', 14)), body);
    this.popover.hidden = false;
    const W = this.mapWrap.clientWidth;
    const H = this.mapWrap.clientHeight;
    const pw = Math.min(260, W - 24);
    this.popover.style.width = `${pw}px`;
    this.popover.style.left = `${Math.max(12, Math.min(W - pw - 12, sx + 14))}px`;
    this.popover.style.top = `${Math.max(12, Math.min(H - 170, sy - 20))}px`;
  }

  closePopover(): void {
    this.popover.hidden = true;
  }

  /** Brings the map into view on phones, where it sits above the panel. */
  revealMap(): void {
    if (window.matchMedia('(max-width: 899px)').matches) this.mapWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
