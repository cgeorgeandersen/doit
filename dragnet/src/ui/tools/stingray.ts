/**
 * The cell-site simulator: park the van, switch it on, and every phone in
 * range connects to it. The list fills up with people who aren't the target.
 */
import { intersectionNear } from '../../core/city';
import { unit } from '../../core/rng';
import { type Capture, capture, maskImsi } from '../../core/stingray';
import { fmtClock, fmtTime } from '../../core/time';
import { fullName, type Person } from '../../core/people';
import type { Console, Tool } from '../console';
import { append, clear, h, num, plural, svgIcon } from '../dom';
import type { Hit, MapView } from '../map';
import { blip } from '../sound';

export interface StingrayArgs {
  imsi?: string;
  near?: { x: number; y: number };
}

interface Dropped {
  person: number;
  t: number;
  emergency: boolean;
}

export function stingrayTool(c: Console): Tool {
  const app = c.app;
  const w = app.world;
  let root: HTMLElement;
  let pos: { x: number; y: number } | null = null;
  let radius = 300;
  let active = false;
  let startedAt = 0;
  let target = '';
  let now: Capture[] = [];
  const seen = new Map<string, Capture>();
  const dropped = new Map<string, Dropped>();
  let located = false;
  let resolved = false;
  let unsub: (() => void) | null = null;
  let live: HTMLElement;
  let lastUpdate = -1;

  const overlay = {
    draw(ctx: CanvasRenderingContext2D, map: MapView, t: number) {
      if (!pos) return;
      const p = map.toScreen(pos.x, pos.y);
      const r = radius * map.scale;
      ctx.strokeStyle = active ? 'rgba(255, 79, 94, 0.7)' : 'rgba(255, 181, 71, 0.6)';
      ctx.fillStyle = active ? 'rgba(255, 79, 94, 0.07)' : 'rgba(255, 181, 71, 0.05)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash(active ? [] : [6, 5]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      if (active) {
        const phase = ((t * 60 * 1.4) % 1 + 1) % 1;
        for (let k = 0; k < 3; k++) {
          const f = (phase + k / 3) % 1;
          ctx.strokeStyle = `rgba(255, 79, 94, ${0.5 * (1 - f)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * f, 0, Math.PI * 2);
          ctx.stroke();
        }
        for (const cap of now) {
          const q = w.positionAt(cap.person, t);
          const s = map.toScreen(q.x + (((cap.person * 37) % 21) - 10) * 0.9, q.y + (((cap.person * 53) % 17) - 8) * 0.9);
          const isTarget = cap.imsi === target;
          ctx.strokeStyle = isTarget ? 'rgba(255, 79, 94, 0.95)' : 'rgba(255, 79, 94, 0.25)';
          ctx.lineWidth = isTarget ? 2 : 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(s.x, s.y);
          ctx.stroke();
          ctx.fillStyle = isTarget ? '#ff4f5e' : '#ffd0d4';
          ctx.beginPath();
          ctx.arc(s.x, s.y, isTarget ? 5 : 2.4, 0, Math.PI * 2);
          ctx.fill();
          if (isTarget && located) map.tag(s.x + 8, s.y - 10, `TARGET · ${intersectionNear(q.x, q.y)}`, '#ff4f5e');
        }
      }
      // the van
      ctx.fillStyle = '#e8eef4';
      ctx.strokeStyle = '#05090d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(p.x - 9, p.y - 5, 18, 10, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = active ? '#ff4f5e' : '#ffb547';
      ctx.beginPath();
      ctx.arc(p.x, p.y - 8, 2.5, 0, Math.PI * 2);
      ctx.fill();
    },
  };

  function update(t: number): void {
    if (!active || !pos) return;
    now = capture(w, pos.x, pos.y, radius, t);
    for (const cap of now) {
      if (!seen.has(cap.imsi)) seen.set(cap.imsi, cap);
      if (cap.onCall) {
        const key = `${cap.person}:${Math.floor(t / 4)}`;
        if (!dropped.has(key)) {
          dropped.set(key, { person: cap.person, t, emergency: unit(w.seed, 'e911', cap.person, Math.floor(t / 4)) < 0.15 || (dropped.size === 1 && t - startedAt > 3) });
        }
      }
    }
    app.audit.touch(now.map((x) => x.person));
    app.emit('stingray-capture', { captures: now });
    if (target && now.some((x) => x.imsi === target)) {
      const tgt = now.find((x) => x.imsi === target) as Capture;
      if (!seen.has(`found:${target}`)) {
        seen.set(`found:${target}`, tgt);
        if (app.soundOn) blip('alert');
        c.toast(`Target IMSI ${maskImsi(target)} connected. Signal ${tgt.signal} dBm.`, 'warn');
      }
    }
    drawLive();
  }

  function drawLive(): void {
    if (!live) return;
    clear(live);
    if (!active && seen.size === 0) return;
    const collected = [...seen.entries()].filter(([k]) => !k.startsWith('found:')).map(([, v]) => v);
    const tgt = now.find((x) => x.imsi === target);
    const drops = [...dropped.values()];
    append(live, [
      h(
        'div',
        { class: 'stats' },
        stat(num(now.length), 'connected now'),
        stat(num(collected.length), 'phones collected'),
        stat(num(drops.length), 'calls dropped', drops.some((d) => d.emergency) ? 'danger' : undefined),
      ),
      target
        ? h(
            'div',
            { class: `callout ${tgt ? 'callout-hit' : ''}` },
            tgt
              ? h('p', null, h('strong', null, 'Target connected. '), `IMSI ${maskImsi(target)}, ${tgt.signal} dBm, about ${Math.round(tgt.meters)} m from the van.`)
              : h('p', null, `Waiting for target IMSI ${maskImsi(target)}…`),
            tgt && !located
              ? h('button', { class: 'btn btn-small btn-primary', type: 'button', onclick: () => locate(tgt) }, svgIcon('target', 14), ' Locate (direction finding)')
              : null,
            located && tgt ? h('p', { class: 'small' }, `Fix: ${intersectionNear(w.positionAt(tgt.person, app.now).x, w.positionAt(tgt.person, app.now).y)}, inside ${placeName(tgt.person)}.`) : null,
          )
        : null,
      drops.some((d) => d.emergency)
        ? h('p', { class: 'warn-text small' }, `A 911 call from a phone held by the device was cut off at ${fmtTime(drops.find((d) => d.emergency)!.t)}.`)
        : null,
      h(
        'div',
        { class: 'imsi-head' },
        h('span', { class: 'label' }, 'Collected identifiers'),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => resolveAll() }, resolved ? 'Resolved' : 'Resolve to subscribers'),
      ),
      h(
        'ul',
        { class: 'imsis' },
        ...collected
          .sort((a, b) => (a.imsi === target ? -1 : b.imsi === target ? 1 : b.signal - a.signal))
          .slice(0, 80)
          .map((x) => {
            const p = w.people[x.person] as Person;
            return h(
              'li',
              { class: x.imsi === target ? 'is-target' : '' },
              h('span', { class: 'mono' }, maskImsi(x.imsi)),
              h('span', { class: 'muted' }, resolved ? fullName(p) : x.carrier),
              h('span', { class: 'mono muted' }, `${x.signal} dBm`),
            );
          }),
      ),
    ]);
  }

  function placeName(person: number): string {
    const pos = w.positionAt(person, app.now);
    return pos.place !== null ? (w.city.places[pos.place]?.name ?? 'a building') : 'a moving vehicle';
  }

  function stat(value: string, label: string, tone?: string): HTMLElement {
    return h('div', { class: `stat ${tone ? `stat-${tone}` : ''}` }, h('strong', null, value), h('span', null, label));
  }

  function locate(tgt: Capture): void {
    located = true;
    app.emit('stingray-target', { person: tgt.person });
    const q = w.positionAt(tgt.person, app.now);
    c.map.flyTo(q.x, q.y, Math.max(c.map.scale, 1.4));
    drawLive();
  }

  function resolveAll(): void {
    resolved = true;
    const people = [...seen.values()].map((x) => x.person);
    app.log('stingray', `resolve ${plural(people.length, 'IMSI')} to subscribers`, app.lastReason || 'identify', people);
    drawLive();
  }

  function render(args: StingrayArgs = {}): void {
    clear(root);
    if (args.imsi) target = args.imsi;
    if (args.near) c.map.flyTo(args.near.x, args.near.y, Math.max(c.map.scale, 0.8));
    const imsi = h('input', { class: 'input mono', type: 'text', value: target, placeholder: 'Leave empty to collect everything', 'aria-label': 'Target IMSI' });
    const range = h('input', { type: 'range', min: 100, max: 600, step: 25, value: radius, 'aria-label': 'Range in meters' });
    const rangeLabel = h('span', { class: 'mono' }, `${radius} m`);
    range.addEventListener('input', () => {
      radius = Number(range.value);
      rangeLabel.textContent = `${radius} m`;
    });
    const placeLabel = h('span', { class: 'area-label' }, pos ? `Parked near ${intersectionNear(pos.x, pos.y)}` : 'Not placed yet');
    const placeBtn = h('button', { class: 'btn btn-small', type: 'button', onclick: () => placing() }, svgIcon('target', 16), pos ? ' Move the van' : ' Place the van on the map');
    const reason = c.reasonField();
    const startBtn = h('button', { class: `btn ${active ? 'btn-danger' : 'btn-primary'}`, type: 'submit' }, active ? 'Switch off' : 'Switch on');
    live = h('div', { class: 'live' });

    function placing(): void {
      c.map.mode = 'point';
      placeLabel.textContent = 'Tap the map where the van should park…';
      placeBtn.classList.add('active');
      c.revealMap();
      c.map.onPoint = (x, y) => {
        pos = { x, y };
        c.map.mode = 'pan';
        placeBtn.classList.remove('active');
        placeLabel.textContent = `Parked near ${intersectionNear(x, y)}`;
        if (active) update(app.now);
      };
    }

    root.append(
      h(
        'div',
        { class: 'tool-head' },
        h('h2', null, 'Cell-site simulator'),
        h('p', { class: 'tool-sub' }, 'Van-mounted IMSI catcher · pretends to be the strongest cell tower nearby'),
      ),
      h(
        'form',
        {
          class: 'form',
          onsubmit: (e: Event) => {
            e.preventDefault();
            if (active) {
              active = false;
              now = [];
              unsub?.();
              unsub = null;
              render();
              return;
            }
            if (!pos) {
              placing();
              return;
            }
            if (!reason.check()) return;
            target = imsi.value.trim();
            active = true;
            located = false;
            startedAt = app.now;
            seen.clear();
            dropped.clear();
            app.log('stingray', `${radius} m at ${intersectionNear(pos.x, pos.y)}${target ? `, target ${maskImsi(target)}` : ''}`, reason.value(), []);
            app.emit('stingray-start', { x: pos.x, y: pos.y, radius });
            unsub = app.on('tick', ({ now: t }) => {
              if (Math.floor(t * 2) !== lastUpdate) {
                lastUpdate = Math.floor(t * 2);
                update(t);
              }
            });
            update(app.now);
            render();
          },
        },
        h('div', { class: 'field' }, h('label', { class: 'label' }, 'Target IMSI'), imsi, h('span', { class: 'hint' }, 'The device will connect every phone in range regardless.')),
        h('div', { class: 'field' }, h('label', { class: 'label' }, 'Range '), h('div', { class: 'range' }, range, rangeLabel)),
        h('div', { class: 'field' }, h('label', { class: 'label' }, 'Position'), h('div', { class: 'area' }, placeLabel, placeBtn)),
        active ? null : reason.el,
        startBtn,
        active ? h('p', { class: 'hint' }, `Running since ${fmtClock(startedAt)}. Phones connect and drop as people move.`) : null,
      ),
      live,
    );
    drawLive();
  }

  return {
    id: 'stingray',
    name: 'Cell-site simulator',
    short: 'Stingray',
    icon: 'stingray',
    layers: { cameras: false, phones: true },
    mount(el: HTMLElement, args?: unknown) {
      root = el;
      c.map.overlays.set('stingray', overlay);
      render((args ?? {}) as StingrayArgs);
    },
    unmount() {
      c.map.mode = 'pan';
    },
    onHit(_hit: Hit) {
      return false;
    },
  };
}
