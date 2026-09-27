/** Small helpers shared by the SVG charts: sizing, tooltips, and table views. */
import { h } from '../lib/dom';

/** Call `draw(width)` now and whenever the element's width changes. */
export function onWidth(el: HTMLElement, draw: (width: number) => void): () => void {
  let last = -1;
  let frame = 0;
  const run = () => {
    const width = Math.round(el.getBoundingClientRect().width);
    if (width > 0 && width !== last) {
      last = width;
      draw(width);
    }
  };
  run();
  if (!('ResizeObserver' in window)) return () => undefined;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(run);
  });
  ro.observe(el);
  return () => ro.disconnect();
}

export interface Tooltip {
  show(lines: Array<[string, string?]>, x: number, y: number): void;
  hide(): void;
}

/** A tooltip positioned inside `container` (which must be position: relative). */
export function tooltip(container: HTMLElement): Tooltip {
  const tip = h('div', { class: 'chart-tip', role: 'status', hidden: true });
  container.append(tip);
  return {
    show(lines, x, y) {
      tip.replaceChildren(
        ...lines.map(([value, label], i) =>
          h('div', { class: i === 0 ? 'chart-tip-value' : 'chart-tip-row' }, value, label ? h('span', { class: 'chart-tip-label' }, label) : ''),
        ),
      );
      tip.hidden = false;
      const cw = container.clientWidth;
      const tw = tip.offsetWidth;
      const left = Math.min(Math.max(0, x - tw / 2), cw - tw);
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, y - tip.offsetHeight - 12)}px`;
    },
    hide() {
      tip.hidden = true;
    },
  };
}

/** Add a "Show as table" toggle under a chart. `build` is called each time the table opens. */
export function tableToggle(host: HTMLElement, label: string, build: () => HTMLTableElement): void {
  const wrap = h('div', { class: 'table-wrap', hidden: true });
  const button = h(
    'button',
    { type: 'button', class: 'btn btn--quiet table-toggle', 'aria-expanded': 'false' },
    'Show as table',
  );
  button.addEventListener('click', () => {
    const open = wrap.hidden;
    if (open) wrap.replaceChildren(build());
    wrap.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? 'Hide table' : 'Show as table';
  });
  button.setAttribute('aria-label', `${label}: show or hide as a table`);
  host.append(button, wrap);
}

export function dataTable(caption: string, headers: string[], rows: Array<Array<string | number>>): HTMLTableElement {
  return h(
    'table',
    { class: 'data-table' },
    h('caption', {}, caption),
    h('thead', {}, h('tr', {}, ...headers.map((t) => h('th', { scope: 'col' }, t)))),
    h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c, i) => (i === 0 ? h('th', { scope: 'row' }, String(c)) : h('td', {}, String(c))))))),
  );
}
