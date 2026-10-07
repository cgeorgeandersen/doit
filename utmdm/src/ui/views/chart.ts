import { h, svg } from '../dom';

export interface Point {
  kind: 'version' | 'refresh';
  title: string;
  detail: string;
  value: number; // 0–1
}

const W = 720;
const H = 200;
const PAD = { left: 40, right: 16, top: 14, bottom: 14 };

/**
 * Share of UTMs fully classified after each event, oldest to newest. One
 * series, so no legend box; the two marker styles get a key. Each point has a
 * tooltip on hover and focus, and the timeline below is the table view.
 */
export function coverageChart(points: Point[]): HTMLElement {
  const x = (i: number) => PAD.left + (points.length < 2 ? (W - PAD.left - PAD.right) / 2 : (i * (W - PAD.left - PAD.right)) / (points.length - 1));
  const y = (v: number) => PAD.top + (1 - v) * (H - PAD.top - PAD.bottom);
  const tooltip = h('div', { class: 'chart-tip', hidden: true });

  const grid = [0, 0.25, 0.5, 0.75, 1].flatMap((v) => [
    svg('line', { x1: PAD.left, x2: W - PAD.right, y1: y(v), y2: y(v), class: v === 0 ? 'chart-axis' : 'chart-grid' }),
    svg('text', { x: PAD.left - 8, y: y(v) + 4, class: 'chart-label', 'text-anchor': 'end' }),
  ]);
  for (const [i, v] of [0, 0.25, 0.5, 0.75, 1].entries()) grid[i * 2 + 1]!.textContent = `${v * 100}%`;

  const line = svg('polyline', { points: points.map((p, i) => `${x(i)},${y(p.value)}`).join(' '), class: 'chart-line' });
  const marks = points.map((p, i) => svg('circle', { cx: x(i), cy: y(p.value), r: 5, class: `chart-dot chart-dot-${p.kind}` }));
  const hits = points.map((p, i) => {
    const hit = svg('circle', { cx: x(i), cy: y(p.value), r: 14, class: 'chart-hit', tabindex: 0, role: 'img',
      'aria-label': `${p.title}: ${Math.round(p.value * 100)}% classified. ${p.detail}` });
    const show = () => {
      tooltip.hidden = false;
      tooltip.replaceChildren(h('strong', null, p.title), h('span', { class: 'chart-tip-value' }, `${Math.round(p.value * 100)}% fully classified`),
        h('span', { class: 'chart-tip-detail' }, p.detail));
      tooltip.style.left = `${(x(i) / W) * 100}%`;
      tooltip.style.top = `${(y(p.value) / H) * 100}%`;
      tooltip.classList.toggle('is-left', i > points.length / 2);
      marks[i]!.classList.add('is-active');
    };
    const hide = () => {
      tooltip.hidden = true;
      marks[i]!.classList.remove('is-active');
    };
    hit.addEventListener('mouseenter', show);
    hit.addEventListener('focus', show);
    hit.addEventListener('mouseleave', hide);
    hit.addEventListener('blur', hide);
    return hit;
  });

  return h(
    'figure',
    { class: 'chart' },
    h('div', { class: 'chart-box' },
      svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'group', 'aria-label': 'Share of UTMs fully classified after each refresh and rules version' },
        ...grid, line, ...marks, ...hits),
      tooltip),
    h('figcaption', { class: 'chart-key' },
      h('span', null, h('span', { class: 'key-dot key-version' }), 'Rules version'),
      h('span', null, h('span', { class: 'key-dot key-refresh' }), 'Refresh'),
      h('span', { class: 'muted' }, 'Oldest on the left. Refreshes bring new UTMs in; rules bring coverage back up.')),
  );
}
