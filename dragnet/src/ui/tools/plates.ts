/**
 * Plate reader search: by plate (with wildcards), by what the car looks like,
 * by camera, plus the hotlist that alerts whenever a listed plate is read.
 */
import { convoy, frequentLocations, normalizePlate, readsAtCamera, recentOvernight, searchFingerprint, searchPlate } from '../../core/alpr';
import { type Camera, nodeXY, route } from '../../core/city';
import { COLORS, fullName, homeOn, STICKERS, VEHICLE_MODELS, type Vehicle, vehicleLabel } from '../../core/people';
import { dayOf, fmtDate, fmtRelativeDay, fmtTime, MIN_PER_DAY } from '../../core/time';
import type { Read } from '../../core/world';
import type { Console, Tool } from '../console';
import { append, clear, h, num, plural } from '../dom';
import type { MapView } from '../map';

type Tab = 'plate' | 'look' | 'camera' | 'hotlist';

interface Group {
  text: string;
  vehicle: Vehicle;
  reads: Read[];
}

const WINDOWS = [
  { label: 'Last 24 hours', minutes: MIN_PER_DAY },
  { label: 'Last 7 days', minutes: 7 * MIN_PER_DAY },
  { label: 'Last 30 days', minutes: 30 * MIN_PER_DAY },
];

export function platesTool(c: Console): Tool {
  const app = c.app;
  const w = app.world;
  let tab: Tab = 'plate';
  let root: HTMLElement;
  let results: HTMLElement;
  let selected: Group | null = null;
  /** The camera nearest where the selected car sleeps, once analyzed. */
  let sleepCamera: Camera | null = null;

  const trailOverlay = {
    draw(_ctx: CanvasRenderingContext2D, map: MapView) {
      if (!selected) return;
      const reads = [...selected.reads].sort((a, b) => a.t - b.t);
      // one line per day
      const byDay = new Map<number, Read[]>();
      for (const r of reads) byDay.set(dayOf(r.t), [...(byDay.get(dayOf(r.t)) ?? []), r]);
      const days = [...byDay.keys()].sort((a, b) => a - b);
      days.forEach((d, k) => {
        const recent = k === days.length - 1;
        const pts = roadPath(byDay.get(d) as Read[], selected?.vehicle.id ?? 0);
        map.path(pts, recent ? 'rgba(57, 208, 255, 0.9)' : 'rgba(57, 208, 255, 0.18)', recent ? 3 : 1.5, recent ? undefined : [4, 4]);
      });
      const counts = new Map<number, number>();
      for (const r of reads) counts.set(r.camera, (counts.get(r.camera) ?? 0) + 1);
      for (const [cam, n] of counts) {
        const cm = w.city.cameras[cam];
        if (!cm) continue;
        const p = map.toScreen(cm.x, cm.y);
        const ctx = map.ctx;
        ctx.fillStyle = 'rgba(57, 208, 255, 0.18)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8 + Math.sqrt(n) * 3, 0, Math.PI * 2);
        ctx.fill();
        map.tag(p.x + 10, p.y - 12, String(n), '#39d0ff');
      }
      const last = reads[reads.length - 1];
      if (last) {
        const cm = w.city.cameras[last.camera] as { x: number; y: number };
        map.pin(cm.x, cm.y, '#ffb547', `last read ${fmtTime(last.t)} ${fmtRelativeDay(dayOf(last.t), app.now)}`, 5);
      }
      if (sleepCamera) {
        const p = map.toScreen(sleepCamera.x, sleepCamera.y);
        map.ctx.strokeStyle = '#ff5fd2';
        map.ctx.lineWidth = 2;
        map.ctx.setLineDash([5, 4]);
        map.ctx.beginPath();
        map.ctx.arc(p.x, p.y, 34, 0, Math.PI * 2);
        map.ctx.stroke();
        map.ctx.setLineDash([]);
        map.tag(p.x + 36, p.y + 14, 'sleeps near here', '#ff5fd2');
      }
    },
  };

  /** Joins reads along the streets, not as the crow flies. */
  function roadPath(reads: Read[], habit: number): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    reads.forEach((r, k) => {
      const node = (w.city.cameras[r.camera] as { node: number }).node;
      if (k === 0) {
        out.push(nodeXY(node));
        return;
      }
      const prev = (w.city.cameras[(reads[k - 1] as Read).camera] as { node: number }).node;
      for (const n of route(w.city, prev, node, habit).slice(1)) out.push(nodeXY(n));
    });
    return out;
  }

  const header = () =>
    h(
      'div',
      { class: 'tool-head' },
      h('h2', null, 'Plate reader search'),
      h('p', { class: 'tool-sub' }, `${w.city.cameras.length} cameras · 30-day retention · ${num(w.reads.filter((r) => r.t <= app.now).length)} reads on file`),
      h(
        'div',
        { class: 'tabs', role: 'tablist' },
        ...(
          [
            ['plate', 'Plate'],
            ['look', 'Description'],
            ['camera', 'Camera'],
            ['hotlist', 'Hotlist'],
          ] as [Tab, string][]
        ).map(([id, label]) => h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(tab === id), onclick: () => { tab = id; render(); } }, label)),
      ),
    );

  function windowSelect(): HTMLSelectElement {
    return h('select', { class: 'input', 'aria-label': 'Time window' }, ...WINDOWS.map((o, k) => h('option', { value: k, selected: k === 2 }, o.label)));
  }

  function render(args?: { plate?: string; camera?: number }): void {
    clear(root);
    selected = null;
    sleepCamera = null;
    c.map.highlight.clear();
    root.append(header());
    results = h('div', { class: 'results' });
    if (tab === 'plate') renderPlateForm(args?.plate);
    if (tab === 'look') renderLookForm();
    if (tab === 'camera') renderCameraForm(args?.camera);
    if (tab === 'hotlist') renderHotlist();
    root.append(results);
  }

  function renderPlateForm(prefill?: string): void {
    const plate = h('input', { class: 'input mono plate-input', type: 'text', value: prefill ?? '', placeholder: '7KDM392', 'aria-label': 'Plate', autocomplete: 'off', spellcheck: 'false' });
    const win = windowSelect();
    const reason = c.reasonField();
    const run = () => {
      if (!plate.value.trim()) {
        plate.focus();
        return;
      }
      if (!reason.check()) return;
      const span = WINDOWS[Number(win.value)]?.minutes ?? 30 * MIN_PER_DAY;
      const hits = searchPlate(w, plate.value, { from: app.now - span, to: app.now });
      const groups = groupHits(hits);
      const people = new Set(groups.map((g) => g.vehicle.owner));
      app.log('plates', normalizePlate(plate.value), reason.value(), people);
      app.emit('plate-search', { query: normalizePlate(plate.value), vehicles: groups.map((g) => g.vehicle.id), reads: groups.reduce((a, g) => a + g.reads.length, 0) });
      showGroups(groups, `plate ${plate.value.toUpperCase()}`);
    };
    plate.addEventListener('keydown', (e) => e.key === 'Enter' && run());
    root.append(
      h(
        'form',
        { class: 'form', onsubmit: (e: Event) => { e.preventDefault(); run(); } },
        h('div', { class: 'field' }, h('label', { class: 'label' }, 'Plate'), plate, h('span', { class: 'hint' }, 'Wildcards: * for any characters, ? for one. Partial plates work.')),
        h('div', { class: 'field' }, h('label', { class: 'label' }, 'When'), win),
        reason.el,
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Search'),
      ),
    );
    if (prefill) plate.focus();
  }

  function renderLookForm(): void {
    const sel = (label: string, values: string[]) => {
      const s = h('select', { class: 'input', 'aria-label': label }, h('option', { value: '' }, 'Any'), ...values.map((v) => h('option', { value: v }, v)));
      return { s, field: h('div', { class: 'field field-half' }, h('label', { class: 'label' }, label), s) };
    };
    const type = sel('Body type', ['sedan', 'SUV', 'pickup', 'minivan', 'hatchback', 'wagon', 'van', 'coupe']);
    const color = sel('Color', [...COLORS]);
    const make = sel('Make', [...new Set(VEHICLE_MODELS.map((m) => m.make).concat(['Chevrolet', 'Ford', 'Subaru']))].sort());
    const feature = sel('Feature or sticker', ['roof rack', 'tow hitch', 'bike rack', 'tinted windows', 'dented rear bumper', ...STICKERS.map((s) => `sticker: ${s}`)]);
    const win = windowSelect();
    const reason = c.reasonField();
    const run = () => {
      if (!reason.check()) return;
      const f = {
        type: type.s.value || undefined,
        color: color.s.value || undefined,
        make: make.s.value || undefined,
        feature: feature.s.value.replace('sticker: ', '') || undefined,
      };
      if (!f.type && !f.color && !f.make && !f.feature) return;
      const span = WINDOWS[Number(win.value)]?.minutes ?? 30 * MIN_PER_DAY;
      const found = searchFingerprint(w, f, { from: app.now - span, to: app.now });
      const desc = [f.color, f.make, f.type, f.feature && `with ${f.feature}`].filter(Boolean).join(' ');
      app.log('plates', `vehicle: ${desc}`, reason.value(), [...found.keys()].map((v) => (w.vehicles[v] as Vehicle).owner));
      app.emit('fingerprint-search', { query: desc, vehicles: [...found.keys()] });
      clear(results);
      const rows = [...found.entries()].sort((a, b) => b[1].length - a[1].length);
      results.append(
        h('p', { class: 'result-sum' }, `${plural(rows.length, 'vehicle')} matching “${desc}”, no plate needed.`),
        h(
          'ul',
          { class: 'rows' },
          ...rows.slice(0, 60).map(([vid, reads]) => {
            const v = w.vehicles[vid] as Vehicle;
            return h(
              'li',
              null,
              h(
                'button',
                { class: 'row', type: 'button', onclick: () => { tab = 'plate'; render({ plate: v.plate }); } },
                h('span', { class: 'mono row-main' }, v.plate),
                h('span', { class: 'row-sub' }, `${vehicleLabel(v)}${v.features.length ? ` · ${v.features.join(', ')}` : ''}`),
                h('span', { class: 'row-num' }, plural(reads.length, 'read')),
              ),
            );
          }),
        ),
      );
    };
    root.append(
      h(
        'form',
        { class: 'form', onsubmit: (e: Event) => { e.preventDefault(); run(); } },
        h('p', { class: 'hint' }, 'The cameras also log what each car looks like, so you can search without a plate.'),
        h('div', { class: 'field-row' }, type.field, color.field),
        h('div', { class: 'field-row' }, make.field, feature.field),
        h('div', { class: 'field' }, h('label', { class: 'label' }, 'When'), win),
        reason.el,
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Search'),
      ),
    );
  }

  function renderCameraForm(prefill?: number): void {
    const cam = h('select', { class: 'input', 'aria-label': 'Camera' }, ...w.city.cameras.map((cm) => h('option', { value: cm.id, selected: cm.id === prefill }, `${String(cm.id + 1).padStart(2, '0')} · ${cm.name}`)));
    const span = h('select', { class: 'input', 'aria-label': 'Time window' }, h('option', { value: 60 }, 'Last hour'), h('option', { value: 360, selected: true }, 'Last 6 hours'), h('option', { value: MIN_PER_DAY }, 'Last 24 hours'));
    const reason = c.reasonField();
    const run = () => {
      if (!reason.check()) return;
      const id = Number(cam.value);
      const reads = readsAtCamera(w, id, { from: app.now - Number(span.value), to: app.now }).reverse();
      const cm = w.city.cameras[id];
      app.log('plates', `camera ${cm?.name}`, reason.value(), reads.map((r) => (w.vehicles[r.vehicle] as Vehicle).owner));
      if (cm) c.map.flyTo(cm.x, cm.y, Math.max(c.map.scale, 0.9));
      clear(results);
      results.append(
        h('p', { class: 'result-sum' }, `${plural(reads.length, 'car')} passed ${cm?.name}.`),
        h('ul', { class: 'rows' }, ...reads.slice(0, 80).map((r) => readRow(r, true))),
      );
    };
    root.append(
      h(
        'form',
        { class: 'form', onsubmit: (e: Event) => { e.preventDefault(); run(); } },
        h('div', { class: 'field' }, h('label', { class: 'label' }, 'Camera'), cam),
        h('div', { class: 'field' }, h('label', { class: 'label' }, 'When'), span),
        reason.el,
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'List reads'),
      ),
    );
    if (prefill !== undefined) run();
  }

  function renderHotlist(): void {
    const plate = h('input', { class: 'input mono plate-input', type: 'text', placeholder: 'Plate', 'aria-label': 'Plate to add' });
    const reason = c.reasonField();
    const list = h('ul', { class: 'rows' });
    const draw = () => {
      clear(list);
      for (const e of app.hotlist) {
        list.append(h('li', { class: 'row static' }, h('span', { class: 'mono row-main' }, e.plate), h('span', { class: 'row-sub' }, `${e.reason} · ${e.description}`)));
      }
    };
    draw();
    root.append(
      h('p', { class: 'hint' }, 'Every camera checks every plate it reads against this list and alerts at once on a match. A match is only what the OCR read; the listed car and the car in the photo can differ.'),
      list,
      h(
        'form',
        {
          class: 'form',
          onsubmit: (e: Event) => {
            e.preventDefault();
            const p = normalizePlate(plate.value);
            if (!p || !reason.check()) return;
            const vid = [...w.plateIndex.entries()].find(([k]) => normalizePlate(k) === p)?.[1];
            app.hotlist.push({ plate: p, reason: `Added by you: “${reason.value()}”`, description: vid !== undefined ? vehicleLabel(w.vehicles[vid] as Vehicle) : 'unknown vehicle' });
            app.log('plates', `hotlist add ${p}`, reason.value(), vid !== undefined ? [(w.vehicles[vid] as Vehicle).owner] : []);
            plate.value = '';
            draw();
            c.toast(`${p} is on the hotlist. You'll get an alert the next time any camera reads it.`);
          },
        },
        h('div', { class: 'field' }, h('label', { class: 'label' }, 'Add a plate'), plate),
        reason.el,
        h('button', { class: 'btn', type: 'submit' }, 'Add to hotlist'),
      ),
    );
  }

  function groupHits(hits: ReturnType<typeof searchPlate>): Group[] {
    const groups: Group[] = [];
    for (const hit of hits) {
      const byVehicle = new Map<number, Read[]>();
      for (const r of hit.reads) byVehicle.set(r.vehicle, [...(byVehicle.get(r.vehicle) ?? []), r]);
      for (const [vid, reads] of byVehicle) groups.push({ text: hit.text, vehicle: w.vehicles[vid] as Vehicle, reads });
    }
    return groups.sort((a, b) => b.reads.length - a.reads.length);
  }

  function showGroups(groups: Group[], what: string): void {
    clear(results);
    if (groups.length === 0) {
      results.append(h('p', { class: 'result-sum' }, `No reads for ${what} in that window.`));
      return;
    }
    const total = groups.reduce((a, g) => a + g.reads.length, 0);
    results.append(h('p', { class: 'result-sum' }, `${plural(total, 'read')} for ${what}${groups.length > 1 ? `, from ${groups.length} different vehicles` : ''}.`));
    const main = groups[0] as Group;
    for (const g of groups) {
      const differs = groups.length > 1 && g !== main && (g.vehicle.type !== main.vehicle.type || g.vehicle.color !== main.vehicle.color);
      const body = h('div', { class: 'group-body' });
      const card = h(
        'section',
        { class: `group${differs ? ' group-warn' : ''}` },
        h(
          'button',
          { class: 'group-head', type: 'button', onclick: () => select(g, body) },
          h('span', { class: 'mono group-plate' }, g.text),
          h('span', { class: 'group-desc' }, `${g.vehicle.color} ${g.vehicle.make} ${g.vehicle.model} (${g.vehicle.type})`),
          h('span', { class: 'group-count' }, plural(g.reads.length, 'read')),
          differs ? h('span', { class: 'badge badge-warn' }, 'different vehicle') : null,
        ),
        body,
      );
      results.append(card);
      if (g === main) select(g, body);
    }
  }

  function select(g: Group, body: HTMLElement): void {
    selected = g;
    sleepCamera = null;
    c.map.highlight.clear();
    c.map.highlight.add(g.vehicle.id);
    for (const b of results.querySelectorAll('.group-body')) clear(b);
    const reads = [...g.reads].sort((a, b) => b.t - a.t);
    const analysis = h('div', { class: 'analysis' });
    append(body, [
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => frequent(g, analysis) }, 'Frequent locations'),
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => companions(g, analysis) }, 'Convoy analysis'),
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => owner(g, analysis) }, 'Registered owner'),
      ),
      analysis,
      h('ul', { class: 'rows reads' }, ...reads.slice(0, 40).map((r) => readRow(r, false))),
      reads.length > 40 ? h('p', { class: 'muted small' }, `${reads.length - 40} older reads not shown.`) : null,
    ]);
    const pts = g.reads.map((r) => w.city.cameras[r.camera] as { x: number; y: number });
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    c.map.frame(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), 120);
  }

  function readRow(r: Read, withPlate: boolean): HTMLElement {
    const cam = w.city.cameras[r.camera];
    const v = w.vehicles[r.vehicle] as Vehicle;
    return h(
      'li',
      null,
      h(
        'button',
        { class: 'row', type: 'button', onclick: () => c.showCapture(r) },
        h('span', { class: 'row-time mono' }, `${fmtRelativeDay(dayOf(r.t), app.now)} ${fmtTime(r.t)}`),
        h('span', { class: 'row-sub' }, withPlate ? `${r.text} · ${v.color} ${v.type}` : cam?.name ?? ''),
        h('span', { class: `row-num ${r.conf < 80 ? 'warn-text' : ''}` }, `${r.conf}%`),
      ),
    );
  }

  function frequent(g: Group, out: HTMLElement): void {
    const list = frequentLocations(w, g.reads);
    app.emit('frequent-locations', { vehicle: g.vehicle.id });
    const days = new Set(g.reads.map((r) => dayOf(r.t))).size;
    const sleeper = [...list].sort((a, b) => b.lastOfDay - a.lastOfDay)[0];
    const recent = recentOvernight(w, g.reads);
    const moved = recent && recent.nights >= 3 && sleeper && recent.camera.id !== sleeper.camera.id;
    sleepCamera = moved && recent ? recent.camera : sleeper && sleeper.lastOfDay > 1 ? sleeper.camera : null;
    clear(out);
    append(out, [
      h(
        'div',
        { class: 'callout' },
        moved && recent
          ? h(
              'p',
              null,
              h('strong', null, 'Overnight location changed: '),
              `for the last ${recent.nights} days (since ${fmtDate(recent.since)}) the car's last read of the day was near ${recent.camera.name}. Before that it was usually near ${sleeper.camera.name}.`,
            )
          : sleeper && sleeper.lastOfDay > 1
            ? h('p', null, h('strong', null, 'Likely overnight location: '), `near ${sleeper.camera.name}. The car's last read of the day was here on ${sleeper.lastOfDay} of ${days} days.`)
            : h('p', null, 'Not enough days of reads to say where this car spends its nights.'),
        h(
          'ul',
          { class: 'mini' },
          ...list.slice(0, 6).map((f) => h('li', null, h('span', null, f.camera.name), h('span', { class: 'muted' }, `${f.count}× · usually ${fmtTime(f.typicalMinute)}`))),
        ),
      ),
    ]);
  }

  function companions(g: Group, out: HTMLElement): void {
    const list = convoy(w, g.reads, g.vehicle.id).slice(0, 6);
    app.log('plates', `convoy ${g.text}`, app.lastReason || 'associates', list.map((x) => (w.vehicles[x.vehicle] as Vehicle).owner));
    clear(out);
    out.append(
      h(
        'div',
        { class: 'callout' },
        h('p', null, list.length ? 'Vehicles that keep passing the same cameras within 90 seconds of this one:' : 'No vehicle travels with this one often enough to flag.'),
        h(
          'ul',
          { class: 'mini' },
          ...list.map((x) => {
            const v = w.vehicles[x.vehicle] as Vehicle;
            return h(
              'li',
              null,
              h('button', { class: 'linkish mono', type: 'button', onclick: () => { tab = 'plate'; render({ plate: v.plate }); } }, v.plate),
              h('span', { class: 'muted' }, `${v.color} ${v.make} · together ${x.together}× on ${x.days} days`),
            );
          }),
        ),
        list.length ? h('p', { class: 'hint' }, 'Convoy analysis is sold for finding accomplices. It also finds carpools, partners, and people who just commute at the same time.') : null,
      ),
    );
  }

  function owner(g: Group, out: HTMLElement): void {
    const p = w.people[g.vehicle.owner];
    if (!p) return;
    app.log('plates', `owner of ${g.vehicle.plate}`, app.lastReason || 'owner lookup', [p.id]);
    app.emit('owner-lookup', { vehicle: g.vehicle.id });
    const home = w.city.places[homeOn(p, dayOf(app.now))];
    const misread = normalizePlate(g.text) !== normalizePlate(g.vehicle.plate);
    clear(out);
    out.append(
      h(
        'div',
        { class: 'callout' },
        h('p', null, h('strong', null, 'Registered to: '), `${fullName(p)}, ${p.age}`),
        h('p', { class: 'muted' }, p.resident ? `${(p.homes[0] && w.city.places[p.homes[0].place]?.address) ?? ''}${p.unit ? `, ${p.unit}` : ''} (DMV address)` : 'Out-of-state registration'),
        misread ? h('p', { class: 'warn-text' }, `The car's real plate is ${g.vehicle.plate}. The camera read it as ${g.text}.`) : null,
        home && p.homes.length > 1 ? h('p', { class: 'muted small' }, `Address on file may be out of date.`) : null,
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => c.open('dossier', { person: p.id }) }, 'Open dossier'),
      ),
    );
  }

  return {
    id: 'plates',
    name: 'Plate reader search',
    short: 'Plates',
    icon: 'plates',
    layers: { cameras: true },
    mount(el: HTMLElement, args?: unknown) {
      root = el;
      const a = (args ?? {}) as { plate?: string; camera?: number; tab?: Tab };
      tab = a.camera !== undefined ? 'camera' : a.tab ?? 'plate';
      c.map.overlays.set('trail', trailOverlay);
      render(a);
    },
    unmount() {
      selected = null;
    },
  };
}
