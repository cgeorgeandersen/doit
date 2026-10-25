/**
 * Phone location data: draw a box on the map, pick a window, and get every
 * device that reported from inside it. Then, device by device, its trail,
 * where it sleeps, and whose it is.
 */
import { intersectionNear, type Place } from '../../core/city';
import { bedDown, type Device, geofence, householdAt, normRect, pings, type Rect, sharesLocation } from '../../core/location';
import { fullName, type Person } from '../../core/people';
import { dayOf, fmtDate, fmtTime, MIN_PER_DAY } from '../../core/time';
import type { Console, Tool } from '../console';
import { clear, h, num, plural, svgIcon } from '../dom';
import type { MapView } from '../map';

const PALETTE = ['#39d0ff', '#ffb547', '#3ee09a', '#ff5fd2', '#a38bff', '#ff8a5c', '#7fe3ff', '#e8f06a'];

export interface LocationArgs {
  place?: number;
  rect?: Rect;
  day?: number;
  from?: number;
  to?: number;
}

export function locationTool(c: Console): Tool {
  const app = c.app;
  const w = app.world;
  let root: HTMLElement;
  let rect: Rect | null = null;
  let devices: Device[] = [];
  let trail: { person: number; color: string } | null = null;
  let source: 'broker' | 'warrant' = 'broker';
  let approved = false;
  let windowStart = 0;
  let windowEnd = 0;
  const unmasked = new Set<number>();

  const overlay = {
    draw(ctx: CanvasRenderingContext2D, map: MapView) {
      if (rect) map.drawRect(rect, '#39d0ff', devices.length === 0);
      devices.slice(0, 40).forEach((d, k) => {
        const color = PALETTE[k % PALETTE.length] as string;
        ctx.fillStyle = color;
        for (const g of d.inside) {
          const p = map.toScreen(g.x, g.y);
          ctx.fillRect(p.x - 1.6, p.y - 1.6, 3.2, 3.2);
        }
      });
      if (trail) {
        const pts = pings(w, trail.person, windowStart - 60, windowEnd + 60);
        map.path(pts, trail.color, 2);
        for (const g of pts) {
          const p = map.toScreen(g.x, g.y);
          ctx.fillStyle = trail.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        const last = pts[pts.length - 1];
        if (last) map.pin(last.x, last.y, trail.color, fmtTime(last.t), 4);
      }
    },
  };

  function render(args: LocationArgs = {}): void {
    clear(root);
    devices = [];
    trail = null;
    approved = false;
    if (args.place !== undefined) {
      const p = w.city.places[args.place] as Place;
      rect = { x0: p.x - 60, y0: p.y - 50, x1: p.x + 60, y1: p.y + 50 };
      c.map.frame(rect.x0, rect.y0, rect.x1, rect.y1, 160);
    } else if (args.rect) {
      rect = args.rect;
    }
    const today = dayOf(app.now);
    const day = h(
      'select',
      { class: 'input', 'aria-label': 'Day' },
      ...Array.from({ length: 8 }, (_, k) => today - k).map((d) => h('option', { value: d, selected: d === (args.day ?? today) }, `${d === today ? 'Today' : d === today - 1 ? 'Yesterday' : fmtDate(d)}`)),
    );
    const hours = (sel: number) =>
      h('select', { class: 'input', 'aria-label': 'Time' }, ...Array.from({ length: 96 }, (_, k) => k * 15).map((m) => h('option', { value: m, selected: m === sel }, fmtTime(m))));
    const from = hours(args.from ?? Math.max(0, Math.floor(((app.now % MIN_PER_DAY) - 120) / 15) * 15));
    const to = hours(args.to ?? Math.min(95 * 15, Math.floor((app.now % MIN_PER_DAY) / 15) * 15));
    const reason = c.reasonField();
    const areaLabel = h('span', { class: 'area-label' }, rect ? describe(rect) : 'No area yet');
    const drawBtn = h('button', { class: 'btn btn-small', type: 'button', onclick: () => startDrawing() }, svgIcon('draw', 16), ' Draw area on map');
    const results = h('div', { class: 'results' });
    const sourceBox = h(
      'fieldset',
      { class: 'sources' },
      h('legend', { class: 'label' }, 'Where the data comes from'),
      sourceOption('broker', 'Commercial data broker', 'Location points apps collected and sold, keyed to advertising IDs. Results in seconds; no warrant, because police bought it.'),
      sourceOption('warrant', 'Geofence warrant', 'A court order to a tech company for its users’ location history. Since June 2026 the Supreme Court treats this as a Fourth Amendment search.'),
    );

    function sourceOption(id: 'broker' | 'warrant', title: string, body: string): HTMLElement {
      return h(
        'label',
        { class: 'source-opt' },
        h('input', { type: 'radio', name: 'loc-source', value: id, checked: source === id, onchange: () => (source = id) }),
        h('span', null, h('strong', null, title), h('span', { class: 'muted small' }, body)),
      );
    }

    function startDrawing(): void {
      c.map.mode = 'rect';
      c.map.rectDraft = null;
      areaLabel.textContent = 'Drag a box on the map…';
      drawBtn.classList.add('active');
      c.revealMap();
      c.map.onRect = (r) => {
        rect = normRect(r);
        c.map.mode = 'pan';
        c.map.rectDraft = null;
        drawBtn.classList.remove('active');
        areaLabel.textContent = describe(rect);
        devices = [];
        clear(results);
      };
    }

    const run = () => {
      if (!rect) {
        startDrawing();
        return;
      }
      if (!reason.check()) return;
      const d = Number(day.value);
      windowStart = d * MIN_PER_DAY + Number(from.value);
      windowEnd = d * MIN_PER_DAY + Number(to.value);
      if (windowEnd <= windowStart) windowEnd = windowStart + 60;
      windowEnd = Math.min(windowEnd, app.now);
      if (source === 'warrant' && !approved) {
        warrantStep(results, reason.value(), () => {
          approved = true;
          execute(results, reason.value());
        });
        return;
      }
      execute(results, reason.value());
    };

    root.append(
      h(
        'div',
        { class: 'tool-head' },
        h('h2', null, 'Phone location data'),
        h('p', { class: 'tool-sub' }, `${num(w.people.filter(sharesLocation).length)} devices reporting · advertising-ID location feed`),
      ),
      h(
        'form',
        { class: 'form', onsubmit: (e: Event) => { e.preventDefault(); run(); } },
        sourceBox,
        h('div', { class: 'field' }, h('label', { class: 'label' }, 'Area'), h('div', { class: 'area' }, areaLabel, drawBtn)),
        h('div', { class: 'field-row' }, h('div', { class: 'field field-third' }, h('label', { class: 'label' }, 'Day'), day), h('div', { class: 'field field-third' }, h('label', { class: 'label' }, 'From'), from), h('div', { class: 'field field-third' }, h('label', { class: 'label' }, 'To'), to)),
        reason.el,
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Find devices'),
      ),
      results,
    );
  }

  function describe(r: Rect): string {
    const width = Math.round(Math.abs(r.x1 - r.x0));
    const height = Math.round(Math.abs(r.y1 - r.y0));
    return `${width} × ${height} m near ${intersectionNear((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)}`;
  }

  function warrantStep(out: HTMLElement, reason: string, done: () => void): void {
    clear(out);
    const text = h('textarea', { class: 'input', rows: 3, 'aria-label': 'Probable cause' }, `Burglary investigation. Seeking location records of devices present in the area and window described. (${reason})`);
    out.append(
      h(
        'div',
        { class: 'callout' },
        h('h3', null, 'Warrant application'),
        h('p', { class: 'muted small' }, 'A geofence warrant names a place and time, not a person: everyone whose phone was there is in it. Courts are split on whether that can ever be specific enough.'),
        text,
        h(
          'button',
          {
            class: 'btn btn-primary',
            type: 'button',
            onclick: () => {
              clear(out);
              out.append(h('p', { class: 'result-sum' }, 'Signed by Judge A. Morrow. In real life this takes days to weeks; the simulation skips ahead.'));
              window.setTimeout(done, 700);
            },
          },
          'Submit to a judge',
        ),
      ),
    );
  }

  function execute(out: HTMLElement, reason: string): void {
    if (!rect) return;
    devices = geofence(w, rect, windowStart, windowEnd);
    trail = null;
    app.log('location', `geofence ${describe(rect)}, ${fmtDate(dayOf(windowStart))} ${fmtTime(windowStart)}–${fmtTime(windowEnd)}`, reason, devices.map((d) => d.person));
    app.emit('geofence', { devices, source });
    clear(out);
    const totals = devices.reduce((a, d) => a + d.inside.length, 0);
    out.append(
      h('p', { class: 'result-sum' }, `${plural(devices.length, 'device')} reported ${plural(totals, 'location')} inside the box.`),
      h('p', { class: 'hint' }, 'Each device is an advertising ID, not a name. That is what makes this data legal to sell.'),
    );
    const list = h('ul', { class: 'devices' });
    devices.forEach((d, k) => list.append(deviceRow(d, PALETTE[k % PALETTE.length] as string)));
    out.append(list);
  }

  function deviceRow(d: Device, color: string): HTMLElement {
    const p = w.people[d.person] as Person;
    const all = pings(w, d.person, windowStart, windowEnd);
    const stayed = all.length > 0 && d.inside.length / all.length > 0.9;
    const detail = h('div', { class: 'device-detail' });
    const name = h('span', { class: 'device-id mono' }, unmasked.has(p.id) ? fullName(p) : d.adId.slice(0, 13));
    return h(
      'li',
      { class: 'device' },
      h(
        'div',
        { class: 'device-head' },
        h('i', { class: 'swatch', style: `background:${color}` }),
        name,
        h('span', { class: 'device-stats' }, `${d.inside.length} pts · ${plural(d.visits, 'pass', 'passes')} · ${fmtTime(d.first)}–${fmtTime(d.last)}`),
        stayed ? h('span', { class: 'badge' }, 'never left') : d.visits >= 3 ? h('span', { class: 'badge badge-warn' }, `passed ${d.visits}×`) : null,
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => showTrail(d, color, detail) }, 'Trail ±1 h'),
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => sleeps(d, detail) }, 'Where it sleeps'),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => unmask(d, detail, name) }, 'Unmask'),
      ),
      detail,
    );
  }

  function showTrail(d: Device, color: string, out: HTMLElement): void {
    trail = { person: d.person, color };
    app.log('location', `trail of ${d.adId.slice(0, 13)}`, app.lastReason || 'context', [d.person]);
    app.emit('device-context', { person: d.person });
    const pts = pings(w, d.person, windowStart - 60, windowEnd + 60);
    clear(out);
    if (pts.length) {
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      c.map.frame(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), 80);
      const first = pts[0];
      const last = pts[pts.length - 1];
      out.append(
        h('p', { class: 'small' }, `${plural(pts.length, 'point')} from ${fmtTime(first!.t)} to ${fmtTime(last!.t)}. Starts near ${intersectionNear(first!.x, first!.y)}, ends near ${intersectionNear(last!.x, last!.y)}.`),
      );
    }
  }

  function sleeps(d: Device, out: HTMLElement): void {
    const bed = bedDown(w, d.person, app.now);
    clear(out);
    if (!bed) {
      out.append(h('p', { class: 'small muted' }, 'Not enough nighttime points to say.'));
      return;
    }
    const residents = householdAt(w, bed.place.id, dayOf(app.now));
    app.log('location', `bed-down ${d.adId.slice(0, 13)}`, app.lastReason || 'context', [d.person, ...residents.map((r) => r.id)]);
    app.emit('device-context', { person: d.person });
    out.append(
      h(
        'div',
        { class: 'callout' },
        h('p', null, h('strong', null, `${bed.place.kind === 'home' || bed.place.kind === 'apartment' ? bed.place.address : bed.place.name}`), h('span', { class: 'muted' }, ` · ${bed.nights} of the last ${bed.of} nights, 1–5 a.m.`)),
        bed.place.confidential ? h('p', { class: 'warn-text small' }, 'This address is confidential in county records.') : null,
        residents.length
          ? h('p', { class: 'small' }, 'Property records for that address: ', residents.map((r) => fullName(r)).join(', '), '.')
          : h('p', { class: 'small muted' }, 'No residents on file for that address.'),
        h('p', { class: 'hint' }, 'No subpoena needed: the place a phone sleeps is a home, and a home has names on it.'),
      ),
    );
  }

  function unmask(d: Device, out: HTMLElement, name: HTMLElement): void {
    const p = w.people[d.person] as Person;
    unmasked.add(p.id);
    name.textContent = fullName(p);
    app.log('location', `unmask ${d.adId.slice(0, 13)}`, app.lastReason || 'identify', [p.id]);
    app.emit('unmask', { person: p.id });
    clear(out);
    out.append(
      h(
        'div',
        { class: 'callout' },
        h('p', null, h('strong', null, fullName(p)), h('span', { class: 'muted' }, `, ${p.age} · ${p.phone.number} · ${p.phone.carrier}`)),
        h('p', { class: 'small muted' }, p.bio ?? (p.job ? `${p.job.title}, ${w.city.places[p.job.place]?.name}` : 'No employer on file')),
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => c.open('dossier', { person: p.id }) }, 'Open dossier'),
      ),
    );
  }

  return {
    id: 'location',
    name: 'Phone location data',
    short: 'Phones',
    icon: 'location',
    layers: { cameras: false, phones: false },
    mount(el: HTMLElement, args?: unknown) {
      root = el;
      c.map.overlays.set('geofence', overlay);
      render((args ?? {}) as LocationArgs);
    },
    unmount() {
      c.map.mode = 'pan';
    },
  };
}
