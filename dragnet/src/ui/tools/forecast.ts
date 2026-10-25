/**
 * Predictive patrol: run next month's hot-spot forecast a day at a time and
 * watch it confirm itself. True crime is drawn only when you ask for it,
 * because the forecast never sees it either.
 */
import { BLOCK_H, BLOCK_W } from '../../core/city';
import { DEFAULT_FORECAST, eastShareOfTrueRate, forecastScores, type ForecastState, initForecast, stepForecast } from '../../core/forecast';
import type { Console, Tool } from '../console';
import { clear, h, pct } from '../dom';
import type { MapView } from '../map';

/** Validated categorical slots 1–3 (dark), checked against the panel surface. */
const SERIES = [
  { key: 'eastPatrols', label: 'Patrols sent to Eastside', color: '#3987e5' },
  { key: 'eastRecorded', label: 'Recorded crime in Eastside', color: '#d95926' },
  { key: 'eastTrue', label: 'Actual crime in Eastside', color: '#199e70' },
] as const;

type SeriesKey = (typeof SERIES)[number]['key'];

export function forecastTool(c: Console): Tool {
  const app = c.app;
  let root: HTMLElement;
  let state: ForecastState = initForecast(DEFAULT_FORECAST);
  let reveal = false;
  let reportedOnly = false;
  let running = 0;
  let chartHost: HTMLElement;
  let statsHost: HTMLElement;
  let dayLabel: HTMLElement;
  let tableHost: HTMLElement;

  const overlay = {
    draw(ctx: CanvasRenderingContext2D, map: MapView) {
      const scores = forecastScores(state);
      const max = Math.max(...scores, 0.01);
      const maxTrue = Math.max(...state.totalTrue, 1);
      state.cells.forEach((cell, k) => {
        const a = map.toScreen(cell.bi * BLOCK_W + 8, cell.bj * BLOCK_H + 8);
        const b = map.toScreen((cell.bi + 1) * BLOCK_W - 8, (cell.bj + 1) * BLOCK_H - 8);
        const v = reveal ? (state.totalTrue[k] as number) / maxTrue : (scores[k] as number) / max;
        ctx.fillStyle = reveal ? `rgba(25, 158, 112, ${0.08 + 0.55 * v})` : `rgba(57, 135, 229, ${0.06 + 0.62 * v * v})`;
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        if (state.patrolled[k]) {
          ctx.strokeStyle = '#e8eef4';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(a.x + 3, a.y + 3, b.x - a.x - 6, b.y - a.y - 6);
          const cx = (a.x + b.x) / 2;
          const cy = (a.y + b.y) / 2;
          ctx.fillStyle = '#e8eef4';
          ctx.beginPath();
          ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      if (state.day > 0) map.tag(12, map.height - 52, reveal ? 'Showing: crime that actually happened' : 'Showing: the forecast (patrol boxes outlined)', reveal ? '#5fd3a8' : '#7fb0f0');
    },
  };

  function step(days: number): void {
    window.clearInterval(running);
    let left = days;
    running = window.setInterval(() => {
      if (left-- <= 0) {
        window.clearInterval(running);
        app.emit('forecast-run', { days: state.day, reportedOnly, revealed: reveal });
        return;
      }
      stepForecast(state);
      update();
    }, 45);
  }

  function update(): void {
    dayLabel.textContent = `Day ${state.day} of the forecast`;
    drawStats();
    drawChart();
    drawTable();
  }

  function drawStats(): void {
    clear(statsHost);
    const recent = state.history.slice(-7);
    const avg = (k: SeriesKey | 'hitRate') => (recent.length ? recent.reduce((a, x) => a + x[k], 0) / recent.length : 0);
    const totalRecorded = state.totalRecorded.reduce((a, x) => a + x, 0);
    const eastRecordedAll = state.cells.reduce((a, cell, k) => a + (cell.district === 'Eastside' ? (state.totalRecorded[k] as number) : 0), 0);
    statsHost.append(
      tile(state.day ? pct(avg('eastPatrols')) : '—', 'of patrols sent to Eastside', SERIES[0].color),
      tile(state.day ? pct(totalRecorded ? eastRecordedAll / totalRecorded : 0) : '—', 'of recorded crime is in Eastside', SERIES[1].color),
      tile(pct(eastShareOfTrueRate(state)), 'of actual crime is in Eastside', SERIES[2].color, !reveal),
      tile(state.day ? pct(avg('hitRate')) : '—', 'forecast “accuracy” (vendor metric)'),
    );
  }

  function tile(value: string, label: string, color?: string, hidden = false): HTMLElement {
    return h(
      'div',
      { class: 'stat' },
      h('strong', { class: hidden ? 'redacted' : '' }, hidden ? '██%' : value),
      h('span', null, color ? h('i', { class: 'key-line', style: `background:${color}` }) : null, label),
    );
  }

  function drawChart(): void {
    clear(chartHost);
    const W = Math.max(260, chartHost.clientWidth || 340);
    const H = 170;
    const pad = { l: 34, r: 12, t: 10, b: 22 };
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = h('canvas', { class: 'chart', role: 'img', 'aria-label': 'Share of patrols, recorded crime and actual crime in Eastside, by day of the forecast' });
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const tip = h('div', { class: 'chart-tip', hidden: true });
    chartHost.append(canvas, tip, legend());
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.scale(dpr, dpr);
    const days = Math.max(30, state.day);
    const x = (d: number) => pad.l + ((W - pad.l - pad.r) * d) / days;
    const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v);
    // grid
    ctx.strokeStyle = '#1a2a38';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#9fb2c4';
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      ctx.beginPath();
      ctx.moveTo(pad.l, Math.round(y(v)) + 0.5);
      ctx.lineTo(W - pad.r, Math.round(y(v)) + 0.5);
      ctx.stroke();
      ctx.fillText(`${v * 100}%`, pad.l - 5, y(v));
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let d = 0; d <= days; d += days > 60 ? 30 : 10) ctx.fillText(`day ${d}`, x(d), H - pad.b + 6);
    const trueShare = eastShareOfTrueRate(state);
    for (const s of SERIES) {
      if (s.key === 'eastTrue' && !reveal) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      state.history.forEach((pt, k) => {
        const v = s.key === 'eastTrue' ? trueShare : smooth(state.history, k, s.key);
        if (k === 0) ctx.moveTo(x(pt.day), y(v));
        else ctx.lineTo(x(pt.day), y(v));
      });
      ctx.stroke();
    }
    canvas.addEventListener('pointermove', (e) => {
      if (state.history.length === 0) return;
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left;
      const d = Math.max(1, Math.min(state.day, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * days)));
      const k = d - 1;
      const pt = state.history[k];
      if (!pt) return;
      tip.hidden = false;
      clear(tip);
      tip.append(
        h('strong', null, `Day ${d}`),
        ...SERIES.filter((s) => s.key !== 'eastTrue' || reveal).map((s) =>
          h('span', null, h('i', { class: 'key-line', style: `background:${s.color}` }), `${s.label}: ${pct(s.key === 'eastTrue' ? trueShare : smooth(state.history, k, s.key))}`),
        ),
      );
      tip.style.left = `${Math.min(W - 190, Math.max(0, px + 10))}px`;
    });
    canvas.addEventListener('pointerleave', () => (tip.hidden = true));
  }

  function legend(): HTMLElement {
    return h(
      'div',
      { class: 'legend' },
      ...SERIES.map((s) => h('span', { class: s.key === 'eastTrue' && !reveal ? 'legend-off' : '' }, h('i', { class: 'key-line', style: `background:${s.color}` }), s.label, s.key === 'eastTrue' && !reveal ? ' (hidden)' : '')),
    );
  }

  function drawTable(): void {
    clear(tableHost);
    if (state.day === 0) return;
    const rows = state.history.filter((pt) => pt.day % 5 === 0 || pt.day === 1);
    tableHost.append(
      h(
        'table',
        { class: 'data-table' },
        h('thead', null, h('tr', null, h('th', null, 'Day'), h('th', null, 'Patrols in Eastside'), h('th', null, 'Recorded crime in Eastside'), h('th', null, 'Actual crime in Eastside'))),
        h(
          'tbody',
          null,
          ...rows.map((pt) => {
            const k = pt.day - 1;
            return h('tr', null, h('td', null, String(pt.day)), h('td', null, pct(smooth(state.history, k, 'eastPatrols'))), h('td', null, pct(smooth(state.history, k, 'eastRecorded'))), h('td', null, reveal ? pct(eastShareOfTrueRate(state)) : 'hidden'));
          }),
        ),
      ),
    );
  }

  function render(): void {
    clear(root);
    dayLabel = h('span', { class: 'mono' }, `Day ${state.day} of the forecast`);
    statsHost = h('div', { class: 'stats stats-4' });
    chartHost = h('div', { class: 'chart-host' });
    tableHost = h('div');
    root.append(
      h(
        'div',
        { class: 'tool-head' },
        h('h2', null, 'Predictive patrol'),
        h('p', { class: 'tool-sub' }, `Hot-spot forecast for next month · ${state.params.patrols} patrol boxes a day · learns from recorded crime`),
      ),
      h('p', { class: 'hint' }, 'The forecast starts from last year’s arrest records and marks the blocks most likely to have crime. Patrols go there. Whatever they find goes back into the records the forecast learns from.'),
      h(
        'div',
        { class: 'actions forecast-actions' },
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => step(1) }, 'Run 1 day'),
        h('button', { class: 'btn btn-small btn-primary', type: 'button', onclick: () => step(30) }, 'Run 30 days'),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { window.clearInterval(running); state = initForecast({ ...DEFAULT_FORECAST, reportedOnly }); render(); } }, 'Reset'),
        dayLabel,
      ),
      h(
        'div',
        { class: 'toggles' },
        h(
          'label',
          null,
          h('input', { type: 'checkbox', checked: reveal, onchange: (e: Event) => { reveal = (e.target as HTMLInputElement).checked; update(); app.emit('forecast-run', { days: state.day, reportedOnly, revealed: reveal }); } }),
          ' Show what actually happened',
        ),
        h(
          'label',
          null,
          h('input', { type: 'checkbox', checked: reportedOnly, onchange: (e: Event) => { reportedOnly = (e.target as HTMLInputElement).checked; window.clearInterval(running); state = initForecast({ ...DEFAULT_FORECAST, reportedOnly }); render(); } }),
          ' Learn only from crimes residents report',
        ),
      ),
      statsHost,
      chartHost,
      h('details', { class: 'explain' }, h('summary', null, 'Show the numbers as a table'), tableHost),
      h(
        'details',
        { class: 'explain' },
        h('summary', null, 'Why the forecast can’t find its own mistake'),
        h(
          'div',
          null,
          h('p', { class: 'small' }, 'In this city, crime is equally likely on every block. The forecast doesn’t know that; it only knows what got recorded. And police record far more of what happens where police are: a patrol on the block sees the drug sale, the fight, the broken taillight. Residents report only a fraction of the rest.'),
          h('p', { class: 'small' }, 'So the blocks that started with more arrests get more patrols, which find more crime there, which raises their forecast. Statisticians model this as an urn: pull a ball, put it back with another of the same color, and an early lead snowballs. The model’s data is a record of where police looked, not of where crime happened.'),
          h('p', { class: 'small' }, 'The vendor’s accuracy metric makes it worse: the forecast’s boxes contain lots of recorded crime because that is where the recording happens. The forecast grades its own homework.'),
          h('p', { class: 'small' }, 'Tick “Learn only from crimes residents report” to try the fix researchers proposed: those reports don’t depend on where patrols were, so the forecast drifts back toward the truth.'),
        ),
      ),
    );
    update();
  }

  return {
    id: 'forecast',
    name: 'Predictive patrol',
    short: 'Forecast',
    icon: 'forecast',
    layers: { cameras: false, traffic: false },
    mount(el: HTMLElement) {
      root = el;
      c.map.overlays.set('forecast', overlay);
      c.map.fit();
      render();
    },
    unmount() {
      window.clearInterval(running);
    },
  };
}

/** A 5-day trailing average, so one day's noise doesn't read as a trend. */
function smooth(history: ForecastState['history'], k: number, key: SeriesKey): number {
  let sum = 0;
  let n = 0;
  for (let i = Math.max(0, k - 4); i <= k; i++) {
    sum += (history[i] as ForecastState['history'][number])[key];
    n++;
  }
  return n ? sum / n : 0;
}
