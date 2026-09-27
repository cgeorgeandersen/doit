/**
 * Chapter 4: The Trust Map.
 *
 * Twelve tasks, two axes: how easy the output is for you to check (x) and how
 * bad a mistake would be (y). Tasks can be dragged onto the map, clicked and
 * then placed with a click, or placed from the keyboard: select a task, pick a
 * quadrant, then nudge it with the arrow keys. "Compare with ours" overlays
 * the essay's placements, each with its reason.
 */
import { h, qs } from '../lib/dom';
import { caseFile } from '../lib/store';
import { announce } from '../lib/announce';
import { cite, renderCitations } from '../lib/citations';
import { QUADRANTS, TASKS, TIPS, quadrantOf, type Quadrant, type TrustTask } from '../content/trustmap';

interface Point {
  x: number;
  y: number;
}

/** Quadrants in reading order of the map: top row, then bottom row. */
const LAYOUT: Quadrant[] = ['human', 'verify', 'ideas', 'delegate'];
/** Where keyboard-placed tasks start: the middle of each quadrant, nudged away from its label. */
const CENTER: Record<Quadrant, Point> = {
  human: { x: 0.25, y: 0.7 },
  verify: { x: 0.75, y: 0.7 },
  ideas: { x: 0.25, y: 0.3 },
  delegate: { x: 0.75, y: 0.3 },
};
const STEP = 0.04;

const clamp = (v: number, lo = 0.03, hi = 0.97) => Math.min(hi, Math.max(lo, v));

export function mountTrustMap(section: HTMLElement): void {
  const host = qs('#trustmap', section);
  const saved = caseFile.get().trustmap;
  const placements: Record<string, Point> = { ...(saved?.placements ?? {}) };
  let compared = saved?.compared ?? false;
  let selected: string | null = null;

  /* ---------- Structure ---------- */
  const map = h('div', {
    class: 'tm-map',
    role: 'group',
    'aria-label':
      'Trust map. Left to right: hard to easy for you to check. Bottom to top: minor to serious mistakes. Placed tasks can be moved with the arrow keys.',
  });
  const quadrantCells = LAYOUT.map((q) =>
    h(
      'div',
      { class: `tm-q tm-q--${q}`, 'aria-hidden': 'true' },
      h('p', { class: 'tm-q-title' }, QUADRANTS[q].title),
      h('p', { class: 'tm-q-line' }, QUADRANTS[q].line),
    ),
  );
  const overlay = h('div', { class: 'tm-overlay', 'aria-hidden': 'true' });
  map.append(...quadrantCells, overlay);

  const frame = h(
    'div',
    { class: 'tm-frame' },
    h(
      'div',
      { class: 'tm-yaxis', 'aria-hidden': 'true' },
      // Rotated to read bottom to top, so the first item sits at the bottom.
      h('span', {}, 'Minor'),
      h('span', { class: 'tm-axis-title' }, 'How bad is a mistake?'),
      h('span', {}, 'Serious'),
    ),
    map,
    h(
      'div',
      { class: 'tm-xaxis', 'aria-hidden': 'true' },
      h('span', {}, 'Hard for you'),
      h('span', { class: 'tm-axis-title' }, 'How easy is it to check?'),
      h('span', {}, 'Easy'),
    ),
  );

  const trayList = h('ul', { class: 'tm-tray-list' });
  const tray = h(
    'div',
    { class: 'tm-tray' },
    h('p', { class: 'tm-tray-title', id: 'tm-tray-title' }, 'Tasks to place'),
    trayList,
  );

  const placer = h('div', { class: 'tm-placer', hidden: true, role: 'group', 'aria-label': 'Place the selected task' });
  const status = h('p', { class: 'tm-status', 'aria-live': 'polite' });
  const compareButton = h('button', { type: 'button', class: 'btn btn--primary' }, 'Compare with ours');
  const clearButton = h('button', { type: 'button', class: 'btn btn--quiet' }, 'Clear the map');
  const legend = h(
    'ul',
    { class: 'legend tm-legend', hidden: true },
    h('li', {}, h('span', { class: 'tm-key tm-key--you' }), 'Your placement'),
    h('li', {}, h('span', { class: 'tm-key tm-key--ours' }), 'Ours'),
  );
  const comparison = h('div', { class: 'tm-compare', hidden: true });

  host.replaceChildren(
    h('div', { class: 'tm-top' }, status, h('div', { class: 'tm-actions' }, compareButton, clearButton)),
    placer,
    h('div', { class: 'tm-layout' }, frame, tray),
    legend,
    comparison,
  );

  /* ---------- Chips ---------- */
  const chips = new Map<string, HTMLButtonElement>();
  const trayItems = new Map<string, HTMLLIElement>();
  const oursMarks = new Map<string, HTMLElement>();

  for (const task of TASKS) {
    const chip = h(
      'button',
      { type: 'button', class: 'tm-chip', 'data-id': task.id, 'aria-pressed': 'false', title: task.label },
      h('span', { class: 'tm-chip-short' }, task.short),
    );
    chips.set(task.id, chip);
    trayItems.set(task.id, h('li', { class: 'tm-tray-item' }, h('span', { class: 'tm-tray-label' }, task.label)));
    wireChip(task, chip);
  }

  function labelFor(task: TrustTask): string {
    const p = placements[task.id];
    if (!p) return `${task.label}. Not placed yet. Press to select, then choose where it goes.`;
    return `${task.label}. Placed in “${QUADRANTS[quadrantOf(p.x, p.y)].title}”. Arrow keys move it.`;
  }

  function render(): void {
    for (const task of TASKS) {
      const chip = chips.get(task.id)!;
      const item = trayItems.get(task.id)!;
      const p = placements[task.id];
      chip.setAttribute('aria-label', labelFor(task));
      chip.setAttribute('aria-pressed', String(selected === task.id));
      chip.classList.toggle('is-selected', selected === task.id);
      if (p) {
        if (chip.parentElement !== map) map.append(chip);
        chip.style.left = `${p.x * 100}%`;
        chip.style.top = `${(1 - p.y) * 100}%`;
        chip.classList.add('is-placed');
        item.classList.add('is-placed');
        if (item.contains(chip)) item.removeChild(chip);
      } else {
        chip.classList.remove('is-placed');
        chip.style.left = '';
        chip.style.top = '';
        item.classList.remove('is-placed');
        if (chip.parentElement !== item) item.prepend(chip);
      }
    }
    trayList.replaceChildren(...TASKS.map((t) => trayItems.get(t.id)!).filter((li) => !li.classList.contains('is-placed')));
    if (!trayList.childElementCount) trayList.append(h('li', { class: 'tm-tray-done' }, 'All twelve placed.'));

    const n = Object.keys(placements).length;
    status.textContent = `${n} of ${TASKS.length} placed`;
    renderPlacer();
    renderComparison();
  }

  function persist(): void {
    caseFile.update((f) => {
      f.trustmap = { placements: { ...placements }, compared };
    });
  }

  function place(id: string, p: Point, focus: boolean): void {
    placements[id] = { x: clamp(p.x), y: clamp(p.y) };
    selected = null;
    persist();
    render();
    const task = TASKS.find((t) => t.id === id)!;
    announce(`${task.short} placed in ${QUADRANTS[quadrantOf(placements[id]!.x, placements[id]!.y)].title}.`);
    if (focus) chips.get(id)?.focus({ preventScroll: true });
  }

  function unplace(id: string): void {
    delete placements[id];
    selected = null;
    persist();
    render();
    chips.get(id)?.focus({ preventScroll: true });
  }

  /** Spread tasks placed from the keyboard so they don't sit on top of each other. */
  function spotIn(q: Quadrant): Point {
    const others = Object.entries(placements).filter(([, p]) => quadrantOf(p.x, p.y) === q).length;
    const rows = [0, -0.08, 0.08, -0.16, 0.16];
    const columns = [0, -0.17, 0.17];
    const c = CENTER[q];
    const dy = rows[others % rows.length]!;
    const dx = columns[Math.floor(others / rows.length) % columns.length]!;
    return { x: c.x + dx, y: c.y + dy };
  }

  function select(id: string | null): void {
    selected = selected === id ? null : id;
    render();
    if (selected) placer.querySelector<HTMLButtonElement>('button')?.focus();
  }

  function renderPlacer(): void {
    if (!selected) {
      placer.hidden = true;
      map.classList.remove('is-placing');
      return;
    }
    const task = TASKS.find((t) => t.id === selected)!;
    const placed = Boolean(placements[task.id]);
    placer.replaceChildren(
      h('p', { class: 'tm-placer-title' }, h('span', { class: 'tm-placer-task' }, task.label), ' — click the map, or choose:'),
      h(
        'div',
        { class: 'tm-placer-buttons' },
        ...(['delegate', 'verify', 'ideas', 'human'] as Quadrant[]).map((q) =>
          h(
            'button',
            {
              type: 'button',
              class: `btn btn--quiet tm-placer-q tm-placer-q--${q}`,
              onclick: () => place(task.id, spotIn(q), true),
            },
            QUADRANTS[q].title,
          ),
        ),
        placed ? h('button', { type: 'button', class: 'btn btn--quiet', onclick: () => unplace(task.id) }, 'Back to the list') : null,
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--quiet',
            onclick: () => {
              const id = selected;
              select(null);
              if (id) chips.get(id)?.focus({ preventScroll: true });
            },
          },
          'Cancel',
        ),
      ),
    );
    placer.hidden = false;
    map.classList.add('is-placing');
  }

  /* ---------- Pointer and keyboard ---------- */
  function mapPoint(clientX: number, clientY: number): Point | null {
    const r = map.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
    return { x: (clientX - r.left) / r.width, y: 1 - (clientY - r.top) / r.height };
  }

  function wireChip(task: TrustTask, chip: HTMLButtonElement): void {
    let suppressClick = false;

    chip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const start = { x: e.clientX, y: e.clientY };
      let ghost: HTMLElement | null = null;

      const move = (ev: PointerEvent) => {
        if (!ghost && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 6) {
          ghost = h('div', { class: 'tm-ghost', 'aria-hidden': 'true' }, task.short);
          document.body.append(ghost);
          chip.classList.add('is-dragging');
          selected = null;
          renderPlacer();
        }
        if (ghost) {
          ev.preventDefault();
          ghost.style.left = `${ev.clientX}px`;
          ghost.style.top = `${ev.clientY}px`;
          map.classList.toggle('is-over', mapPoint(ev.clientX, ev.clientY) !== null);
        }
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        map.classList.remove('is-over');
        chip.classList.remove('is-dragging');
        if (ghost) {
          ghost.remove();
          suppressClick = true;
          const p = ev.type === 'pointerup' ? mapPoint(ev.clientX, ev.clientY) : null;
          if (p) place(task.id, p, false);
        }
      };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });

    chip.addEventListener('click', () => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      select(task.id);
    });

    chip.addEventListener('keydown', (e) => {
      const p = placements[task.id];
      if (e.key === 'Escape' && selected) {
        select(null);
        return;
      }
      if (!p) return;
      const step = e.shiftKey ? STEP * 2.5 : STEP;
      const moves: Record<string, Point> = {
        ArrowLeft: { x: p.x - step, y: p.y },
        ArrowRight: { x: p.x + step, y: p.y },
        ArrowUp: { x: p.x, y: p.y + step },
        ArrowDown: { x: p.x, y: p.y - step },
      };
      const next = moves[e.key];
      if (!next) return;
      e.preventDefault();
      placements[task.id] = { x: clamp(next.x), y: clamp(next.y) };
      persist();
      render();
      chip.focus({ preventScroll: true });
    });
  }

  // Click on the map places the selected task there.
  map.addEventListener('click', (e) => {
    if (!selected || (e.target instanceof Element && e.target.closest('.tm-chip'))) return;
    const p = mapPoint(e.clientX, e.clientY);
    if (p) place(selected, p, true);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selected) {
      const id = selected;
      select(null);
      chips.get(id)?.focus({ preventScroll: true });
    }
  });

  /* ---------- Comparison ---------- */
  function renderComparison(): void {
    legend.hidden = !compared;
    comparison.hidden = !compared;
    compareButton.textContent = compared ? 'Hide our map' : 'Compare with ours';
    compareButton.setAttribute('aria-expanded', String(compared));
    overlay.replaceChildren();
    oursMarks.clear();
    if (!compared) {
      map.classList.remove('is-comparing');
      return;
    }
    map.classList.add('is-comparing');

    // Lines from your spot to ours, drawn in percentages so they scale with the map.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'tm-lines');
    for (const task of TASKS) {
      const mine = placements[task.id];
      if (!mine) continue;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(mine.x * 100));
      line.setAttribute('y1', String((1 - mine.y) * 100));
      line.setAttribute('x2', String(task.x * 100));
      line.setAttribute('y2', String((1 - task.y) * 100));
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(line);
    }
    overlay.append(svg);
    for (const task of TASKS) {
      const mark = h(
        'span',
        { class: `tm-ours${placements[task.id] ? '' : ' tm-ours--labelled'}` },
        placements[task.id] ? '' : h('span', { class: 'tm-ours-label' }, task.short),
      );
      mark.style.left = `${task.x * 100}%`;
      mark.style.top = `${(1 - task.y) * 100}%`;
      overlay.append(mark);
      oursMarks.set(task.id, mark);
    }

    const same = TASKS.filter((t) => placements[t.id] && quadrantOf(placements[t.id]!.x, placements[t.id]!.y) === quadrantOf(t.x, t.y)).length;
    const placedCount = Object.keys(placements).length;
    comparison.replaceChildren(
      h(
        'p',
        { class: 'tm-compare-lede' },
        placedCount
          ? `${same} of your ${placedCount} placements land in the same quadrant as ours. Where we differ, the reasons below are ours, not the last word. Your job, your stakes, your expertise all move the dots.`
          : 'Here is where we would put each task, and why.',
      ),
      h(
        'ol',
        { class: 'tm-reasons' },
        ...TASKS.map((task) => {
          const mine = placements[task.id];
          const ours = quadrantOf(task.x, task.y);
          const yours = mine ? quadrantOf(mine.x, mine.y) : null;
          return h(
            'li',
            { class: yours === null ? '' : yours === ours ? 'is-same' : 'is-different' },
            h('p', { class: 'tm-reason-task' }, task.label),
            h(
              'p',
              { class: 'tm-reason-where' },
              h('span', { class: 'tm-where tm-where--ours' }, `Ours: ${QUADRANTS[ours].title}`),
              yours ? h('span', { class: 'tm-where tm-where--you' }, `You: ${QUADRANTS[yours].title}`) : null,
            ),
            h('p', { class: 'tm-reason-why' }, task.reason),
          );
        }),
      ),
    );
  }

  compareButton.addEventListener('click', () => {
    compared = !compared;
    persist();
    render();
    if (compared) announce('Our placements are shown on the map as rings, with our reasons listed below the map.');
  });

  clearButton.addEventListener('click', () => {
    for (const id of Object.keys(placements)) delete placements[id];
    compared = false;
    selected = null;
    caseFile.update((f) => {
      delete f.trustmap;
    });
    render();
    announce('Map cleared. All tasks are back in the list.');
  });

  render();

  /* ---------- Tips ---------- */
  const tipsList = qs('#tips-list', section);
  tipsList.replaceChildren(
    ...TIPS.map((tip) =>
      h('li', { class: 'tip' }, h('p', { class: 'tip-title' }, tip.title), h('p', { class: 'tip-why' }, tip.why, cite(...tip.sources))),
    ),
  );
  renderCitations(section);
}
