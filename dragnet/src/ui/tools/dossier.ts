/**
 * The dossier: one person, everything joined up. Built in seconds from data
 * nobody collected about them on purpose.
 */
import { buildDossier, type Dossier, ROUTINE_LABELS, type RoutineCode } from '../../core/dossier';
import { fullName, vehicleLabel } from '../../core/people';
import { fmtTime } from '../../core/time';
import type { Console, Tool } from '../console';
import { append, clear, h, plural } from '../dom';
import { personPhoto } from '../faces';
import type { MapView } from '../map';

/** Routine colors: three validated categorical slots plus two neutrals. */
const ROUTINE_COLORS: Record<RoutineCode, string> = {
  0: '#0f1b25',
  1: '#3987e5',
  2: '#199e70',
  3: '#4a5b6d',
  4: '#d95926',
  5: '#8a9bb0',
};

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function dossierTool(c: Console): Tool {
  const app = c.app;
  const w = app.world;
  let root: HTMLElement;
  let current: Dossier | null = null;

  const overlay = {
    draw(_ctx: CanvasRenderingContext2D, map: MapView) {
      const d = current;
      if (!d) return;
      const ctx = map.ctx;
      const home = map.toScreen(d.home.x, d.home.y);
      for (const v of d.visits.slice(0, 14)) {
        if (v.place.kind === 'outside') continue;
        const p = map.toScreen(v.place.x, v.place.y);
        ctx.strokeStyle = v.place.tags.length ? 'rgba(217, 89, 38, 0.5)' : 'rgba(138, 155, 176, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(home.x, home.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      for (const v of d.visits.slice(0, 14)) {
        if (v.place.kind === 'outside') continue;
        const sensitive = v.place.tags.length > 0;
        map.pin(v.place.x, v.place.y, sensitive ? '#d95926' : '#8a9bb0', sensitive || v.days.length > 2 ? `${short(v.place.name)} ×${v.days.length}` : undefined, 3 + Math.min(6, v.days.length));
      }
      if (d.work) map.pin(d.work.x, d.work.y, '#199e70', 'work', 6);
      map.pin(d.home.x, d.home.y, '#3987e5', 'home', 7);
    },
  };

  function short(name: string): string {
    return name.length > 22 ? `${name.slice(0, 21)}…` : name;
  }

  function search(): HTMLElement {
    const list = h('datalist', { id: 'dossier-people' }, ...w.people.filter((p) => !p.hidden && p.resident).map((p) => h('option', { value: fullName(p) })));
    const input = h('input', { class: 'input', type: 'search', list: 'dossier-people', placeholder: 'Name, e.g. Ruth Okafor', 'aria-label': 'Person' });
    const reason = c.reasonField();
    const err = h('span', { class: 'field-error', hidden: true }, 'No one by that name in the records.');
    return h(
      'form',
      {
        class: 'form',
        onsubmit: (e: Event) => {
          e.preventDefault();
          const name = input.value.trim().toLowerCase();
          const p = w.people.find((x) => !x.hidden && fullName(x).toLowerCase() === name) ?? w.people.find((x) => !x.hidden && fullName(x).toLowerCase().includes(name) && name.length > 2);
          err.hidden = !!p;
          if (!p || !reason.check()) return;
          open(p.id, reason.value());
        },
      },
      h('div', { class: 'field' }, h('label', { class: 'label' }, 'Person'), input, list, err),
      reason.el,
      h('button', { class: 'btn btn-primary', type: 'submit' }, 'Build dossier'),
    );
  }

  function open(person: number, reason?: string): void {
    const d = buildDossier(w, person, app.now, app.posts);
    current = d;
    const touched = [person, ...d.associates.map((a) => a.person.id), ...d.overnights.flatMap((o) => o.hosts.map((x) => x.id))];
    app.log('dossier', `dossier: ${fullName(d.person)}`, reason ?? (app.lastReason || 'background'), touched);
    app.emit('dossier-open', { person });
    render(d);
    const pts = [d.home, ...d.visits.slice(0, 10).map((v) => v.place)].filter((p) => p.kind !== 'outside');
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    if (pts.length) c.map.frame(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), 90);
  }

  function render(d: Dossier | null): void {
    clear(root);
    root.append(h('div', { class: 'tool-head' }, h('h2', null, 'Dossier'), h('p', { class: 'tool-sub' }, 'Location, plates, photos and posts, fused into one profile')));
    if (!d) {
      root.append(search(), h('p', { class: 'hint' }, 'Any resident can be looked up. You can also open a dossier from plate, phone, face or social results.'));
      return;
    }
    const p = d.person;
    append(root, [
      h(
        'div',
        { class: 'dossier-head' },
        personPhoto(p, 84),
        h(
          'div',
          null,
          h('h3', { class: 'dossier-name' }, fullName(p)),
          h('p', { class: 'small' }, `${p.age} · ${d.home.address}${p.unit ? `, ${p.unit}` : ''}`),
          h('p', { class: 'small muted' }, p.job ? `${p.job.title}, ${w.city.places[p.job.place]?.name}` : 'No employer on file'),
          h('p', { class: 'small mono muted' }, `${p.phone.number} · ad ID ${p.phone.adId.slice(0, 13)}…`),
          d.vehicle ? h('p', { class: 'small mono muted' }, `${d.vehicle.plate} · ${vehicleLabel(d.vehicle)}`) : null,
        ),
        h('div', { class: `threat threat-${d.threat.toLowerCase()}`, title: d.threatReasons.join('; ') || 'No factors' }, h('span', null, 'Threat index'), h('strong', null, d.threat)),
      ),
      h(
        'p',
        { class: 'sources-line small' },
        `Built from ${plural(d.sources.pings, 'location point')} this week, ${plural(d.sources.plateReads, 'plate read')} this month, ${plural(d.sources.posts, 'post')}${d.sources.photos.length ? `, ${d.sources.photos.join(' and ')}` : ''}.`,
      ),
      d.threatReasons.length ? h('p', { class: 'small muted' }, `Threat index factors: ${d.threatReasons.join(' · ')}.`) : null,
      section('What the data says', inferences(d)),
      section('Weekly routine', routine(d)),
      section(`Places visited (last 30 days)`, places(d)),
      d.associates.length ? section('Associates', associates(d)) : null,
      d.posts.length ? section('Posts', h('ul', { class: 'mini' }, ...d.posts.map((x) => h('li', null, h('span', null, `“${x.text}”`))))) : null,
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { current = null; render(null); } }, 'Look up someone else')),
    ]);
  }

  function section(title: string, body: Node): HTMLElement {
    return h('section', { class: 'dossier-sec' }, h('h3', { class: 'section' }, title), body);
  }

  function inferences(d: Dossier): HTMLElement {
    return h(
      'ul',
      { class: 'inferences' },
      ...d.inferences.map((i) =>
        h('li', { class: i.sensitive ? 'sens' : '' }, i.sensitive ? h('span', { class: 'badge badge-sens' }, 'sensitive') : null, h('span', { class: 'inf-text' }, i.text), h('span', { class: 'inf-ev small muted' }, i.evidence)),
      ),
    );
  }

  function routine(d: Dossier): HTMLElement {
    const grid = h('div', { class: 'routine', role: 'img', 'aria-label': 'Where this person usually is at each hour of each day of the week' });
    grid.append(h('span', null), ...Array.from({ length: 24 }, (_, hh) => h('span', { class: 'routine-hour' }, hh % 6 === 0 ? String(hh) : '')));
    d.routine.forEach((row, wd) => {
      grid.append(h('span', { class: 'routine-day' }, WEEK[wd] as string));
      row.forEach((code, hh) => grid.append(h('i', { class: 'cell', style: `background:${ROUTINE_COLORS[code]}`, title: `${WEEK[wd]} ${fmtTime(hh * 60)}: ${ROUTINE_LABELS[code]}` })));
    });
    const legend = h(
      'div',
      { class: 'legend' },
      ...([1, 2, 3, 4, 5] as RoutineCode[]).map((k) => h('span', null, h('i', { class: 'key-sq', style: `background:${ROUTINE_COLORS[k]}` }), ROUTINE_LABELS[k])),
    );
    return h('div', null, grid, legend);
  }

  function places(d: Dossier): HTMLElement {
    return h(
      'ul',
      { class: 'rows' },
      ...d.visits.slice(0, 12).map((v) =>
        h(
          'li',
          { class: 'row static' },
          h('span', { class: 'row-main' }, v.place.kind === 'home' || v.place.kind === 'apartment' ? v.place.address : v.place.name),
          h('span', { class: 'row-sub' }, `${plural(v.days.length, 'day')} · usually ${fmtTime(v.typical)}`),
          v.place.tags.length ? h('span', { class: 'badge badge-sens' }, v.place.tags[0] as string) : null,
        ),
      ),
    );
  }

  function associates(d: Dossier): HTMLElement {
    return h(
      'ul',
      { class: 'rows' },
      ...d.associates.map((a) =>
        h(
          'li',
          null,
          h(
            'button',
            { class: 'row', type: 'button', onclick: () => open(a.person.id) },
            h('span', { class: 'row-main' }, fullName(a.person)),
            h('span', { class: 'row-sub' }, a.how),
          ),
        ),
      ),
    );
  }

  return {
    id: 'dossier',
    name: 'Dossier',
    short: 'Dossier',
    icon: 'dossier',
    layers: { cameras: false },
    mount(el: HTMLElement, args?: unknown) {
      root = el;
      c.map.overlays.set('dossier', overlay);
      const a = (args ?? {}) as { person?: number };
      if (a.person !== undefined) open(a.person);
      else render(current);
    },
  };
}

