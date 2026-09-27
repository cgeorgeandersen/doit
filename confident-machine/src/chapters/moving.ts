/**
 * Chapter 6: The Moving Boundary. Everything here is drawn from
 * src/content/timely.json, so updating that file updates the chapter.
 *
 *  - Time horizons (METR), with a guess-first reveal on a log scale.
 *  - The price of matching GPT-3.5 and GPT-4 (Epoch AI).
 *  - The EU AI Act's timeline, with postponed dates struck through.
 *  - "The half-life of a fact": still true, or overtaken?
 */
import { scaleLog, scaleUtc, type ScaleLogarithmic, type ScaleTime } from 'd3-scale';
import { curveStepAfter, line } from 'd3-shape';
import { h, s, qs } from '../lib/dom';
import { caseFile } from '../lib/store';
import { announce } from '../lib/announce';
import { daysBetween, duration, fmtDate, fmtMonthYear, parseDate } from '../lib/format';
import { HALF_LIFE, buildDate, timelyData } from '../lib/timely';
import { dataTable, onWidth, tableToggle, tooltip } from '../components/chart';
import { reducedMotion } from '../lib/motion';

interface HorizonPoint {
  model: string;
  date: string;
  p50: number;
  p80: number;
}
interface HorizonData {
  doublingDaysSince2023: number;
  reliableLimitMinutes: number;
  series: HorizonPoint[];
}
interface PricePoint {
  date: string;
  price: number;
  model: string;
}
interface PriceSeries {
  id: string;
  label: string;
  threshold: string;
  points: PricePoint[];
}
interface Milestone {
  date: string;
  label: string;
  was?: string;
}

const utc = (iso: string) => parseDate(iso);

export function mountMoving(section: HTMLElement): void {
  mountHorizon(section);
  mountPrices(qs('#prices-chart', section));
  mountRegulation(qs('#regline-list', section));
  mountHalfLife(qs('#halflife', section));
}

/* ------------------------------------------------------------------ */
/* Time horizons                                                       */
/* ------------------------------------------------------------------ */

/** The guess slider runs on a log scale from 1 minute to 40 hours (a working week). */
const GUESS_MAX = 2400;
const toMinutes = (v: number) => Math.pow(10, (v / 1000) * Math.log10(GUESS_MAX));
const toSlider = (minutes: number) => Math.round((Math.log10(Math.max(1, minutes)) / Math.log10(GUESS_MAX)) * 1000);

/** The point the guess is compared with: the latest model in the data. */
function answerPoint(data: HorizonData): HorizonPoint {
  return data.series[data.series.length - 1]!;
}

function mountHorizon(section: HTMLElement): void {
  const data = timelyData<HorizonData>('metr-horizon');
  const host = qs('#horizon-chart', section);
  const guessHost = qs('#horizon-guess', section);
  const desc = qs('#horizon-desc', section);
  const answer = answerPoint(data);
  const reveal = data.series.findIndex((p) => p.model === 'GPT-4');

  let guess: number | null = caseFile.get().moving?.horizonGuess ?? null;
  let revealed = guess !== null;

  /* ---------- The guess ---------- */
  const slider = h('input', { type: 'range', id: 'horizon-range', min: 0, max: 1000, step: 1, value: toSlider(guess ?? 15) });
  const output = h('output', { class: 'guess-value', for: 'horizon-range' });
  const lock = h('button', { type: 'button', class: 'btn btn--primary' }, 'Lock in my guess');
  const skip = h('button', { type: 'button', class: 'btn btn--quiet' }, 'Just show me');
  const syncGuess = () => {
    const m = toMinutes(Number(slider.value));
    output.textContent = duration(m);
    slider.setAttribute('aria-valuetext', duration(m));
    if (!revealed) draw();
  };
  slider.addEventListener('input', syncGuess);

  const finish = (withGuess: boolean) => {
    revealed = true;
    if (withGuess) {
      guess = toMinutes(Number(slider.value));
      caseFile.update((f) => {
        f.moving = { ...(f.moving ?? {}), horizonGuess: Math.round(guess! * 10) / 10 };
      });
    }
    renderGuessPanel();
    draw();
    describe();
    announce(desc.textContent ?? '');
  };
  lock.addEventListener('click', () => finish(true));
  skip.addEventListener('click', () => finish(false));

  function renderGuessPanel(): void {
    if (revealed) {
      guessHost.replaceChildren();
      guessHost.hidden = true;
      return;
    }
    guessHost.hidden = false;
    guessHost.replaceChildren(
      h(
        'label',
        { class: 'guess-q', for: 'horizon-range' },
        `Guess first. In early 2023 the answer was about 4 minutes. By ${fmtMonthYear(answer.date, true)}, how long a task could the best agent finish half the time?`,
      ),
      h('div', { class: 'guess-row' }, slider, output),
      h(
        'div',
        { class: 'guess-ticks', 'aria-hidden': 'true' },
        ...[
          [1, '1 min'],
          [10, '10 min'],
          [60, '1 hr'],
          [480, '8 hr'],
          [2400, '40 hr'],
        ].map(([m, label]) => {
          const el = h('span', {}, String(label));
          el.style.left = `${(Math.log10(Number(m)) / Math.log10(GUESS_MAX)) * 100}%`;
          return el;
        }),
      ),
      h('div', { class: 'guess-actions' }, lock, skip),
    );
    syncGuess();
  }

  function describe(): void {
    const actual = answer.p50;
    if (!revealed) {
      desc.textContent = '';
      return;
    }
    const parts = [
      `By ${fmtMonthYear(answer.date, true)} the best agent could finish, half the time, tasks that take a skilled person about ${duration(actual)}.`,
    ];
    if (guess !== null) {
      const ratio = actual / guess;
      parts.unshift(`You guessed ${duration(guess)}.`);
      parts.push(
        ratio > 1.5
          ? `That is about ${Math.round(ratio)} times your guess.`
          : ratio < 1 / 1.5
            ? `Your guess was about ${Math.round(1 / ratio)} times too high.`
            : 'Your guess was close.',
      );
    }
    parts.push(`For tasks finished four times in five, the figure was about ${duration(answer.p80)}.`);
    desc.textContent = parts.join(' ');
  }

  /* ---------- The chart ---------- */
  const tip = tooltip(host);
  const plot = h('div', { class: 'horizon-plot' });
  host.prepend(plot);
  let width = 0;

  function draw(): void {
    if (!width) return;
    const W = width;
    const narrow = W < 560;
    const H = Math.round(Math.min(460, Math.max(300, W * 0.52)));
    const m = { top: 22, right: narrow ? 64 : 104, bottom: 32, left: narrow ? 46 : 58 };
    const x: ScaleTime<number, number> = scaleUtc().domain([utc('2019-01-01'), utc('2026-12-31')]).range([m.left, W - m.right]);
    const y: ScaleLogarithmic<number, number> = scaleLog().domain([0.005, GUESS_MAX]).range([H - m.bottom, m.top]);
    const shown = revealed ? data.series : data.series.slice(0, reveal + 1);

    const svg = s('svg', {
      viewBox: `0 0 ${W} ${H}`,
      width: W,
      height: H,
      role: 'group',
      'aria-label': 'Time horizons of frontier AI models over time. A table view follows the chart.',
    });
    const grid = s('g', { class: 'grid' });
    const ticks: Array<[number, string]> = [
      [1 / 60, '1 sec'],
      [10 / 60, '10 sec'],
      [1, '1 min'],
      [10, '10 min'],
      [60, '1 hr'],
      [480, '8 hr'],
      [2400, '40 hr'],
    ];
    for (const [v, label] of ticks) {
      grid.append(s('line', { x1: m.left, x2: W - m.right, y1: y(v), y2: y(v) }));
      svg.append(s('text', { class: 'chart-label', x: m.left - 8, y: y(v), dy: '0.32em', 'text-anchor': 'end' }, label));
    }
    for (let year = 2019; year <= 2026; year += 1) {
      if (narrow && year % 2 === 0) continue;
      const xx = x(utc(`${year}-01-01`));
      svg.append(s('text', { class: 'chart-label', x: xx, y: H - m.bottom + 18, 'text-anchor': 'middle' }, String(year)));
    }
    svg.prepend(grid);

    // The reliable-measurement ceiling.
    const limit = y(data.reliableLimitMinutes);
    svg.append(
      s('line', { class: 'horizon-limit', x1: m.left, x2: W - m.right, y1: limit, y2: limit }),
      s(
        'text',
        { class: 'chart-label', x: m.left + 6, y: limit - 6 },
        narrow ? '16 hr: limit of reliable measurement' : '16 hr: beyond this, METR’s tests can’t measure reliably',
      ),
    );

    if (!revealed) {
      const x0 = x(utc('2023-06-01'));
      svg.append(
        s('rect', { class: 'horizon-hidden', x: x0, y: m.top, width: W - m.right - x0, height: H - m.bottom - m.top }),
        s('text', { class: 'chart-label horizon-hidden-label', x: (x0 + W - m.right) / 2, y: y(0.05), 'text-anchor': 'middle' }, 'Lock in a guess to see'),
      );
    }

    const p80 = line<HorizonPoint>()
      .x((p) => x(utc(p.date)))
      .y((p) => y(p.p80));
    const p50 = line<HorizonPoint>()
      .x((p) => x(utc(p.date)))
      .y((p) => y(p.p50));
    svg.append(s('path', { class: 'horizon-p80', d: p80(shown) ?? '' }), s('path', { class: 'horizon-p50', d: p50(shown) ?? '' }));

    for (const p of shown) {
      const cx = x(utc(p.date));
      svg.append(s('circle', { class: 'horizon-dot80', cx, cy: y(p.p80), r: 2.5 }), s('circle', { class: 'horizon-dot', cx, cy: y(p.p50), r: 3.5 }));
      const hit = s('circle', {
        class: 'hit',
        cx,
        cy: y(p.p50),
        r: 11,
        tabindex: '0',
        role: 'img',
        'aria-label': `${p.model}, ${fmtDate(p.date)}: half the time, ${duration(p.p50)}; four times in five, ${duration(p.p80)}.`,
      });
      const show = () => tip.show([[p.model], [`${duration(p.p50)} at 50%`, `${duration(p.p80)} at 80% · ${fmtDate(p.date)}`]], cx, y(p.p50));
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('pointerleave', () => tip.hide());
      hit.addEventListener('blur', () => tip.hide());
      svg.append(hit);
    }

    // Direct labels at the last point shown.
    const last = shown[shown.length - 1]!;
    const lx = x(utc(last.date)) + 8;
    svg.append(
      s('text', { class: 'chart-label chart-label--strong', x: lx, y: y(last.p50), dy: '0.32em' }, narrow ? '50%' : '50% success'),
      s('text', { class: 'chart-label', x: lx, y: y(last.p80), dy: '0.32em' }, narrow ? '80%' : '80% success'),
    );

    // The reader's guess, in the reader's colour.
    const g = revealed ? guess : toMinutes(Number(slider.value));
    if (g !== null) {
      const gx = x(utc(answer.date));
      const gy = y(g);
      svg.append(
        s('line', { class: 'horizon-guess-line', x1: gx - 22, x2: gx + 22, y1: gy, y2: gy }),
        s('text', { class: 'chart-label horizon-guess-label', x: gx - 26, y: gy, dy: '0.32em', 'text-anchor': 'end' }, revealed ? 'Your guess' : 'Your guess?'),
      );
    }
    if (revealed) {
      const ax = x(utc(answer.date));
      svg.append(s('circle', { class: 'horizon-answer', cx: ax, cy: y(answer.p50), r: 7 }));
    }
    plot.replaceChildren(svg);
  }

  onWidth(host, (w) => {
    width = w;
    draw();
  });
  tableToggle(host, 'Time horizons', () =>
    dataTable(
      'Time horizons of frontier models (METR, Time Horizon 1.1)',
      ['Model', 'Released', 'Finished half the time', 'Finished four times in five'],
      data.series.map((p) => [p.model, fmtDate(p.date), duration(p.p50), duration(p.p80)]),
    ),
  );

  renderGuessPanel();
  describe();
}

/* ------------------------------------------------------------------ */
/* Prices                                                              */
/* ------------------------------------------------------------------ */

function mountPrices(host: HTMLElement): void {
  const series = timelyData<{ unit: string; series: PriceSeries[] }>('price-per-token').series;
  const tip = tooltip(host);
  const plot = h('div', { class: 'prices-plot' });
  host.prepend(plot);

  const draw = (W: number) => {
    const narrow = W < 560;
    const H = Math.round(Math.min(380, Math.max(260, W * 0.42)));
    const m = { top: 16, right: narrow ? 70 : 150, bottom: 32, left: 52 };
    const x = scaleUtc().domain([utc('2022-10-01'), utc('2025-04-01')]).range([m.left, W - m.right]);
    const y = scaleLog().domain([0.04, 60]).range([H - m.bottom, m.top]);
    const svg = s('svg', {
      viewBox: `0 0 ${W} ${H}`,
      width: W,
      height: H,
      role: 'group',
      'aria-label': 'Falling price of GPT-3.5-level and GPT-4-level performance. A table view follows the chart.',
    });
    const grid = s('g', { class: 'grid' });
    for (const v of [0.1, 1, 10]) {
      grid.append(s('line', { x1: m.left, x2: W - m.right, y1: y(v), y2: y(v) }));
      svg.append(s('text', { class: 'chart-label', x: m.left - 8, y: y(v), dy: '0.32em', 'text-anchor': 'end' }, v < 1 ? `$${v.toFixed(2)}` : `$${v}`));
    }
    for (const year of [2023, 2024, 2025]) {
      svg.append(s('text', { class: 'chart-label', x: x(utc(`${year}-01-01`)), y: H - m.bottom + 18, 'text-anchor': 'middle' }, String(year)));
    }
    svg.prepend(grid);

    const path = line<PricePoint>()
      .x((p) => x(utc(p.date)))
      .y((p) => y(p.price))
      .curve(curveStepAfter);
    series.forEach((ser) => {
      const cls = ser.id === 'gpt4' ? 'price-line price-line--gpt4' : 'price-line price-line--gpt35';
      svg.append(s('path', { class: cls, d: path(ser.points) ?? '' }));
      for (const p of ser.points) {
        const cx = x(utc(p.date));
        const cy = y(p.price);
        svg.append(s('circle', { class: `price-dot ${ser.id === 'gpt4' ? 'price-dot--gpt4' : 'price-dot--gpt35'}`, cx, cy, r: 3.5 }));
        const hit = s('circle', {
          class: 'hit',
          cx,
          cy,
          r: 11,
          tabindex: '0',
          role: 'img',
          'aria-label': `${ser.label}: ${p.model}, ${fmtDate(p.date)}, $${p.price} per million tokens.`,
        });
        const show = () => tip.show([[`$${p.price} per million tokens`], [p.model, `${ser.label} · ${fmtDate(p.date)}`]], cx, cy);
        hit.addEventListener('pointerenter', show);
        hit.addEventListener('focus', show);
        hit.addEventListener('pointerleave', () => tip.hide());
        hit.addEventListener('blur', () => tip.hide());
        svg.append(hit);
      }
      const first = ser.points[0]!;
      const last = ser.points[ser.points.length - 1]!;
      const drop = Math.round(first.price / last.price);
      svg.append(
        s(
          'text',
          { class: 'chart-label chart-label--strong', x: x(utc(first.date)) + 6, y: y(first.price) - 8 },
          ser.label,
        ),
        s(
          'text',
          { class: 'chart-label', x: x(utc(last.date)) + 8, y: y(last.price), dy: '0.32em' },
          narrow ? `${drop}× less` : `$${last.price}: ${drop}× cheaper`,
        ),
      );
    });
    plot.replaceChildren(svg);
  };
  onWidth(host, draw);
  tableToggle(host, 'Prices', () =>
    dataTable(
      'Cheapest model matching each level, US dollars per million tokens (Epoch AI)',
      ['Level', 'Date', 'Model', 'Price'],
      series.flatMap((ser) => ser.points.map((p) => [ser.label, fmtDate(p.date), p.model, `$${p.price}`])),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* The EU AI Act timeline                                              */
/* ------------------------------------------------------------------ */

function mountRegulation(list: HTMLElement): void {
  const milestones = timelyData<{ milestones: Milestone[] }>('eu-ai-act').milestones;
  const today = buildDate();
  const items: HTMLElement[] = [];
  let todayPlaced = false;
  for (const ms of milestones) {
    const future = parseDate(ms.date).getTime() > today.getTime();
    if (future && !todayPlaced) {
      items.push(h('li', { class: 'regline-today' }, h('span', {}, `Today · ${fmtDate(today.toISOString().slice(0, 10))}`)));
      todayPlaced = true;
    }
    items.push(
      h(
        'li',
        { class: `regline-item ${future ? 'is-future' : 'is-past'}` },
        h(
          'p',
          { class: 'regline-date' },
          ms.was ? h('del', { class: 'regline-was' }, h('span', { class: 'visually-hidden' }, 'originally '), fmtDate(ms.was)) : '',
          ms.was ? h('span', { class: 'regline-arrow', 'aria-hidden': 'true' }, ' → ') : '',
          ms.was ? h('span', { class: 'visually-hidden' }, ', now ') : '',
          h('span', {}, fmtDate(ms.date)),
        ),
        h('p', { class: 'regline-label' }, ms.label),
      ),
    );
  }
  if (!todayPlaced) items.push(h('li', { class: 'regline-today' }, h('span', {}, `Today · ${fmtDate(today.toISOString().slice(0, 10))}`)));
  list.replaceChildren(...items);
}

/* ------------------------------------------------------------------ */
/* The half-life of a fact                                             */
/* ------------------------------------------------------------------ */

type Answer = 'true' | 'overtaken';

function mountHalfLife(host: HTMLElement): void {
  const today = buildDate();
  const start = utc('2022-11-01').getTime();
  const end = today.getTime();
  const at = (iso: string | Date) => (((typeof iso === 'string' ? utc(iso) : iso).getTime() - start) / (end - start)) * 100;
  const saved: Record<string, boolean> = { ...(caseFile.get().moving?.stillTrue ?? {}) };
  let showAll = false;

  const lifespans = HALF_LIFE.filter((c) => c.status === 'overtaken' && c.overtakenOn).map((c) => daysBetween(c.statedOn, c.overtakenOn!));
  const median = medianOf(lifespans);

  const axis = h(
    'div',
    { class: 'hl-axis', 'aria-hidden': 'true' },
    ...[2023, 2024, 2025, 2026].map((year) => {
      const el = h('span', {}, String(year));
      el.style.left = `${at(`${year}-01-01`)}%`;
      return el;
    }),
  );
  const summary = h('div', { class: 'hl-summary', 'aria-live': 'polite' });
  const revealAll = h('button', { type: 'button', class: 'btn btn--quiet' }, 'Show all the answers');
  const list = h('ol', { class: 'hl-list' });

  const rows = HALF_LIFE.map((c) => {
    const buttons = (
      [
        ['true', 'Still true'],
        ['overtaken', 'No longer true'],
      ] as Array<[Answer, string]>
    ).map(([value, label]) => h('button', { type: 'button', class: 'hl-pick', 'aria-pressed': 'false', 'data-value': value }, label));
    const track = h('div', { class: 'hl-track', 'aria-hidden': 'true' });
    const result = h('p', { class: 'hl-result', hidden: true });
    const li = h(
      'li',
      { class: `hl-row hl-row--${c.status}` },
      h(
        'div',
        { class: 'hl-text' },
        h('p', { class: 'hl-claim', id: `hl-${c.id}` }, `“${c.claim}”`),
        h('p', { class: 'hl-meta' }, `${fmtDate(c.statedOn)} · `, h('a', { href: c.statedUrl, target: '_blank', rel: 'noopener' }, c.statedBy)),
      ),
      h('div', { class: 'hl-ask', role: 'group', 'aria-labelledby': `hl-${c.id}` }, ...buttons),
      track,
      result,
    );
    buttons.forEach((b) =>
      b.addEventListener('click', () => {
        saved[c.id] = b.dataset.value === 'true';
        caseFile.update((f) => {
          f.moving = { ...(f.moving ?? {}), stillTrue: { ...saved } };
        });
        render();
        announce(result.textContent ?? '');
      }),
    );
    return { c, li, buttons, track, result };
  });
  list.replaceChildren(...rows.map((r) => r.li));

  function render(): void {
    let answered = 0;
    let right = 0;
    for (const { c, buttons, track, result } of rows) {
      const pick = saved[c.id];
      const done = pick !== undefined || showAll;
      buttons.forEach((b) => {
        b.setAttribute('aria-pressed', String(pick !== undefined && (b.dataset.value === 'true') === pick));
        b.disabled = done;
      });
      const endIso = c.overtakenOn ?? today.toISOString().slice(0, 10);
      const left = at(c.statedOn);
      const bar = h('span', { class: 'hl-bar' });
      bar.style.left = `${left}%`;
      bar.style.width = `${Math.max(0.6, (done ? at(endIso) : at(today)) - left)}%`;
      track.replaceChildren(
        bar,
        (() => {
          const dot = h('span', { class: 'hl-start' });
          dot.style.left = `${left}%`;
          return dot;
        })(),
        done
          ? (() => {
              const endMark = h('span', { class: c.status === 'standing' ? 'hl-end hl-end--standing' : 'hl-end' });
              endMark.style.left = `${at(endIso)}%`;
              return endMark;
            })()
          : h('span', { class: 'hl-unknown' }, '?'),
      );
      track.classList.toggle('is-done', done);

      if (done) {
        const truth: Answer = c.status === 'standing' ? 'true' : 'overtaken';
        let verdict = '';
        if (pick !== undefined) {
          answered += 1;
          if (c.status === 'revised') verdict = 'This one is genuinely unsettled. ';
          else if ((pick ? 'true' : 'overtaken') === truth) {
            right += 1;
            verdict = '✓ Right. ';
          } else verdict = '✗ Not quite. ';
        }
        const life = c.overtakenOn ? daysBetween(c.statedOn, c.overtakenOn) : null;
        const status =
          c.status === 'standing'
            ? `Still standing after ${monthsText(daysBetween(c.statedOn, today))}.`
            : c.status === 'revised'
              ? `Revised ${fmtDate(c.overtakenOn!)}.`
              : `Overtaken by ${fmtDate(c.overtakenOn!)}, after ${monthsText(life!)}.`;
        result.replaceChildren(
          h('strong', {}, verdict + status),
          ' ',
          c.update,
          ' ',
          h('a', { href: c.updateUrl, target: '_blank', rel: 'noopener', class: 'hl-source' }, c.updateBy),
        );
        result.hidden = false;
      } else {
        result.hidden = true;
      }
    }

    const scored = HALF_LIFE.filter((c) => c.status !== 'revised' && saved[c.id] !== undefined).length;
    const allDone = HALF_LIFE.every((c) => saved[c.id] !== undefined) || showAll;
    revealAll.hidden = allDone;
    summary.replaceChildren(
      ...(answered
        ? [h('p', { class: 'hl-score' }, `You called ${right} of ${scored}.`)]
        : [h('p', { class: 'hl-score muted' }, `Answer a few to see how you do.`)]),
      ...(allDone || answered >= 4
        ? [
            h(
              'p',
              { class: 'hl-median' },
              `Of the claims here that were overtaken, the median one lasted ${monthsText(median)}. That is an upper bound: we date each change by the first source we cite that records it.`,
            ),
          ]
        : []),
    );
  }

  revealAll.addEventListener('click', () => {
    showAll = true;
    render();
  });

  host.replaceChildren(axis, list, h('div', { class: 'hl-foot' }, summary, revealAll));
  if (!reducedMotion()) host.classList.add('can-animate');
  render();
}

function medianOf(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function monthsText(days: number): string {
  const months = Math.round(days / 30.44);
  if (months < 1) return 'less than a month';
  if (months < 24) return `${months} ${months === 1 ? 'month' : 'months'}`;
  const years = Math.round((months / 12) * 10) / 10;
  return `${years} years`;
}

