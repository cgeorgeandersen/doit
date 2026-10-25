/**
 * Gunshot detection: alerts as they come in, the recording behind each one,
 * and the decision to send armed officers. Plus the arithmetic that explains
 * why most alerts aren't gunfire.
 */
import { alertLabel, detected, districtOfSound, isAlert, precision, SOUND_LABEL, type SoundEvent, soundsForDay } from '../../core/acoustic';
import { BLOCK_H, BLOCK_W, intersectionNear } from '../../core/city';
import { dayOf, fmtTime } from '../../core/time';
import type { Console, Tool } from '../console';
import { clear, h, pct, plural } from '../dom';
import type { MapView } from '../map';
import { blip, impulseSamples, play, waveformCanvas } from '../sound';

type Status = 'new' | 'dispatch' | 'dismiss' | 'reclassify';

export const ACOUSTIC_STATE = { toasts: true };

export function acousticTool(c: Console): Tool {
  const app = c.app;
  const w = app.world;
  let root: HTMLElement;
  let events: SoundEvent[] = [];
  let eventsDay = -1;
  const status = new Map<string, Status>();
  let selected: SoundEvent | null = null;
  let list: HTMLElement | null = null;
  let detail: HTMLElement | null = null;
  let isOpen = false;

  const all = (): SoundEvent[] => {
    const day = dayOf(app.now);
    if (day !== eventsDay) {
      events = soundsForDay(w, day, true);
      eventsDay = day;
    }
    return events;
  };
  const alertsSoFar = () => all().filter((e) => isAlert(e) && e.t <= app.now);

  app.on('tick', ({ now, prev }) => {
    for (const e of all()) {
      if (e.t > prev && e.t <= now && isAlert(e)) {
        status.set(e.id, 'new');
        app.emit('sound-alert', { event: e });
        if (ACOUSTIC_STATE.toasts) {
          if (app.soundOn) blip('alert');
          c.toast(`Gunshot alert · ${alertLabel(e)}, ${e.rounds} ${e.rounds === 1 ? 'round' : 'rounds'}, ${pct(e.score)} · near ${intersectionNear(e.est.x, e.est.y)}`, 'warn', [{ label: 'Open', run: () => c.open('acoustic', { event: e.id }) }], 9000);
        }
        if (isOpen) drawList();
      }
    }
  });

  const overlay = {
    draw(ctx: CanvasRenderingContext2D, map: MapView, now: number) {
      const shown = alertsSoFar();
      for (const e of shown) {
        const p = map.toScreen(e.est.x, e.est.y);
        const st = status.get(e.id) ?? 'new';
        const color = st === 'dispatch' ? '#ff4f5e' : st === 'dismiss' ? '#6d8296' : st === 'reclassify' ? '#ff5fd2' : '#ffb547';
        const age = (now - e.t) * 60;
        if (age < 90) {
          const f = (age % 3) / 3;
          ctx.strokeStyle = color;
          ctx.globalAlpha = 1 - f;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6 + f * 26, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = color;
        ctx.strokeStyle = '#05090d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, e === selected ? 7 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (e === selected) map.tag(p.x + 10, p.y - 10, `${fmtTime(e.t)} · ${pct(e.score)}`, color);
      }
    },
  };

  function render(args: { event?: string } = {}): void {
    clear(root);
    if (args.event) selected = all().find((e) => e.id === args.event) ?? null;
    list = h('ul', { class: 'rows alerts' });
    detail = h('div', { class: 'alert-detail' });
    const unheard = all().filter((e) => e.t <= app.now && !detected(e)).length;
    root.append(
      h('div', { class: 'tool-head' }, h('h2', null, 'Gunshot detection'), h('p', { class: 'tool-sub' }, `${w.city.sensors.length} rooftop sensors · Eastside and the Harbor only · alerts at 50% confidence and up`)),
      h('p', { class: 'hint' }, `Today so far, ${plural(unheard, 'loud bang')} happened where no sensor could hear ${unheard === 1 ? 'it' : 'them'}. Those get no alert and no armed response. Where the city puts microphones decides where the alerts happen.`),
      h('h3', { class: 'section' }, 'Alerts today'),
      list,
      detail,
      baseRates(),
    );
    drawList();
    drawDetail();
  }

  function drawList(): void {
    if (!list) return;
    clear(list);
    const alerts = alertsSoFar().reverse();
    if (alerts.length === 0) list.append(h('li', { class: 'muted small' }, 'No alerts yet today.'));
    for (const e of alerts) {
      const st = status.get(e.id) ?? 'new';
      list.append(
        h(
          'li',
          null,
          h(
            'button',
            { class: `row ${e === selected ? 'row-on' : ''}`, type: 'button', onclick: () => { selected = e; drawList(); drawDetail(); c.map.flyTo(e.est.x, e.est.y, Math.max(c.map.scale, 0.9)); } },
            h('span', { class: 'row-time mono' }, fmtTime(e.t)),
            h('span', { class: 'row-sub row-two' }, h('span', null, `${alertLabel(e)} · ${e.rounds} ${e.rounds === 1 ? 'round' : 'rounds'}`), h('span', { class: 'muted small' }, `near ${intersectionNear(e.est.x, e.est.y)}`)),
            h('span', { class: `row-num ${e.score >= 0.8 ? 'danger-text' : 'warn-text'}` }, pct(e.score)),
            st !== 'new' ? h('span', { class: `badge badge-${st}` }, st === 'dispatch' ? 'dispatched' : st === 'dismiss' ? 'dismissed' : 'reclassified') : h('span', { class: 'badge badge-new' }, 'new'),
          ),
        ),
      );
    }
  }

  function drawDetail(): void {
    if (!detail) return;
    clear(detail);
    const e = selected;
    if (!e) return;
    const samples = impulseSamples(e.kind, e.rounds, e.id);
    const st = status.get(e.id) ?? 'new';
    const act = (action: 'dispatch' | 'dismiss' | 'reclassify') => {
      status.set(e.id, action);
      app.log('acoustic', `${action} alert ${fmtTime(e.t)} near ${intersectionNear(e.est.x, e.est.y)}`, action === 'reclassify' ? 'detective request' : 'alert triage', []);
      app.emit('sound-triage', { event: e, action });
      if (action === 'dispatch') app.emit('dispatch', { what: 'shots fired', detail: intersectionNear(e.est.x, e.est.y) });
      drawList();
      drawDetail();
    };
    detail.append(
      h(
        'div',
        { class: 'callout' },
        h('div', { class: 'alert-title' }, h('strong', null, `${alertLabel(e)} · ${pct(e.score)}`), h('span', { class: 'muted' }, ` ${fmtTime(e.t)} · ${e.heardBy.length} sensors · ${districtOfSound(e)}`)),
        h('div', { class: 'wave' }, waveformCanvas(samples, 300, 56, '#ffb547'), h('button', { class: 'btn btn-small', type: 'button', onclick: () => play(samples) }, '▶ Play recording')),
        st === 'new'
          ? h(
              'div',
              { class: 'actions' },
              h('button', { class: 'btn btn-small btn-danger', type: 'button', onclick: () => act('dispatch') }, 'Dispatch units'),
              h('button', { class: 'btn btn-small', type: 'button', onclick: () => act('dismiss') }, 'Dismiss'),
            )
          : h('p', { class: 'small' }, outcome(e, st)),
        st !== 'new' && st !== 'reclassify' && e.kind !== 'gunfire' && c.app.mode === 'free'
          ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => act('reclassify') }, 'Ask the vendor to reclassify it as gunfire')
          : null,
      ),
    );
  }

  function outcome(e: SoundEvent, st: Status): string {
    const truth = SOUND_LABEL[e.kind].toLowerCase();
    if (st === 'dispatch') return e.kind === 'gunfire' ? 'Officers found shell casings. It was gunfire.' : `Officers arrived with weapons ready and found no shooting. It was ${truth}. Anyone standing on that corner was the reason they came.`;
    if (st === 'dismiss') return e.kind === 'gunfire' ? 'Dismissed. It was gunfire; a resident called 911 four minutes later.' : `Dismissed. It was ${truth}.`;
    return `Relabeled “gunfire” in the vendor's records. The recording hasn't changed: it was ${truth}.`;
  }

  function baseRates(): HTMLElement {
    let prevalence = 0.05;
    let sensitivity = 0.9;
    let specificity = 0.9;
    const grid = h('div', { class: 'dots', 'aria-hidden': 'true' });
    const sentence = h('p', { class: 'small' });
    const draw = () => {
      const ppv = precision(prevalence, sensitivity, specificity);
      const alertsPer1000 = 1000 * (prevalence * sensitivity + (1 - prevalence) * (1 - specificity));
      clear(grid);
      const real = Math.round(ppv * 100);
      for (let k = 0; k < 100; k++) grid.append(h('i', { class: k < real ? 'dot dot-real' : 'dot' }));
      sentence.textContent = `Out of 1,000 loud bangs, the system raises about ${Math.round(alertsPer1000)} alerts. Only ${pct(ppv)} of those alerts are gunfire: ${real} of every 100 dots.`;
    };
    const slider = (label: string, min: number, max: number, value: number, set: (v: number) => void) => {
      const out = h('span', { class: 'mono' }, pct(value));
      const input = h('input', { type: 'range', min, max, step: 0.01, value, 'aria-label': label });
      input.addEventListener('input', () => {
        set(Number(input.value));
        out.textContent = pct(Number(input.value));
        draw();
      });
      return h('div', { class: 'field' }, h('label', { class: 'label' }, label), h('div', { class: 'range' }, input, out));
    };
    const box = h(
      'details',
      { class: 'explain' },
      h('summary', null, 'Why most alerts are not gunshots'),
      h(
        'div',
        null,
        h('p', { class: 'small' }, 'Think of a smoke alarm that goes off for burnt toast. If you burn toast every morning and have a real fire once a decade, nearly every alarm you ever hear is toast, however good the alarm is. Gunshot sensors live in that world: fireworks, backfires and nail guns vastly outnumber gunshots. This is the base rate, and Bayes’ rule says how much it matters.'),
        slider('Share of loud bangs that are gunfire', 0.01, 0.3, prevalence, (v) => (prevalence = v)),
        slider('Sensitivity (catches real gunfire)', 0.5, 0.99, sensitivity, (v) => (sensitivity = v)),
        slider('Specificity (ignores everything else)', 0.5, 0.99, specificity, (v) => (specificity = v)),
        grid,
        sentence,
        h('p', { class: 'hint' }, 'Chicago’s Inspector General looked at 50,176 alerts from 2020–21: only 9.1% of the ones police responded to turned up evidence of a gun crime.'),
      ),
    );
    draw();
    return box;
  }

  return {
    id: 'acoustic',
    name: 'Gunshot detection',
    short: 'Gunshots',
    icon: 'acoustic',
    layers: { cameras: false, sensors: true },
    mount(el: HTMLElement, args?: unknown) {
      root = el;
      isOpen = true;
      c.map.overlays.set('acoustic', overlay);
      // the area the microphones cover
      c.map.frame(6.4 * BLOCK_W, 0, 12 * BLOCK_W, 9 * BLOCK_H, 40);
      render((args ?? {}) as { event?: string });
    },
    unmount() {
      isOpen = false;
      list = null;
      detail = null;
    },
  };
}

