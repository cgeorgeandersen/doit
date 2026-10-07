import { tableCsv } from '../../core/csv';
import type { Column, Utm } from '../../core/model';
import type { UtmPart } from '../../core/model';
import { displayUtm, normalizeText } from '../../core/normalize';
import { describeRule } from '../../core/rules';
import { canonicalValue, cellOf, columnValues, coverage, isComplete, rulesFor, sortedUtms, type Cell } from '../../core/table';
import { setCell } from '../../core/workspace';
import { button, emptyState, linkButton, meter, pageHeader } from '../components';
import type { Ctx } from '../ctx';
import { fill, h } from '../dom';
import { fmtInt, fmtPct, plural } from '../format';
import { icon, type IconName } from '../icons';
import { hashFor } from '../routes';
import { addUtmsDrawer } from './add-utms';
import { columnDrawer } from './column-drawer';
import { downloadText } from './download';

type Show = 'all' | 'open' | 'done';
const PAGE_SIZE = 200;
// The campaign is the UTM's name, so it comes first and stays put while the other columns scroll.
const PARTS: UtmPart[] = ['campaign', 'source', 'medium', 'content', 'term'];
const TIP_KEY = 'utmdm-tip-hidden';
const WIDTHS_KEY = 'utmdm-column-widths';
const MIN_WIDTH = 70;
const MAX_WIDTH = 900;

// Kept between renders, so a save doesn't lose your place.
let query = '';
let shown = PAGE_SIZE;
let editing: { utm: string; column: string; initial?: string } | null = null;
let focusAfter: { utm: string; column: string } | null = null;
let detachEditor: (() => void) | null = null;
let resizeWatch: ResizeObserver | null = null;
let fitTable: (() => void) | null = null;
// Set once this browser has been seen not to pin the first column on its own.
let heldByHand = false;
// Column widths someone dragged, by column: a preference of this browser, not a change to the table.
let widths: Record<string, number> = loadWidths();

function loadWidths(): Record<string, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(WIDTHS_KEY) ?? '{}') as unknown;
    return saved && typeof saved === 'object' ? saved as Record<string, number> : {};
  } catch {
    return {};
  }
}

function saveWidths(): void {
  try {
    localStorage.setItem(WIDTHS_KEY, JSON.stringify(widths));
  } catch {
    // kept for this visit
  }
}
if (typeof window !== 'undefined') window.addEventListener('resize', () => fitTable?.());

export function tableView(ctx: Ctx): HTMLElement {
  detachEditor?.();
  detachEditor = null;
  resizeWatch?.disconnect();
  const { table, grid, params } = ctx;
  const show: Show = params.get('show') === 'open' ? 'open' : params.get('show') === 'done' ? 'done' : 'all';
  const emptyIn = table.columns.find((c) => c.id === params.get('empty'));
  const cov = coverage(table, grid);
  const complete = (utm: Utm) => isComplete(table, grid, utm);
  const inShow = (utm: Utm, s: Show) => s === 'all' || (s === 'done') === complete(utm);
  const base = sortedUtms(table.utms).filter((u) => !emptyIn || cellOf(grid, u.key, emptyIn.id).from === 'empty');
  const here = (s: Show, extra: Record<string, string | null> = {}) =>
    hashFor('table', { show: s === 'all' ? null : s, empty: emptyIn?.id, ...extra });
  const open = cov.utms - cov.complete;

  const tableHost = h('div', { class: 'table-wrap' });
  const countLine = h('p', { class: 'table-count', 'aria-live': 'polite' });

  const renderTable = () => {
    const needle = normalizeText(query);
    const rows = base.filter((u) => inShow(u, show) && (!needle || matchesSearch(u, needle)));
    countLine.textContent = `${plural(rows.length, 'UTM')}${needle ? ` matching "${query.trim()}"` : ''}`;
    const visible = rows.slice(0, shown);
    fill(
      tableHost,
      table.columns.map((c) => h('datalist', { id: `values-${c.id}` }, ...columnValues(table, c.id).map((v) => h('option', { value: v })))),
      // A grid of plain blocks rather than an HTML table: browsers pin a column of
      // blocks reliably, where pinning table cells varies from one browser to the next.
      sheet(visible),
      rows.length > shown
        ? h('div', { class: 'table-more' }, button(`Show ${fmtInt(Math.min(PAGE_SIZE, rows.length - shown))} more`, {
          onClick: () => {
            shown += PAGE_SIZE;
            renderTable();
          },
        }))
        : null,
      !rows.length ? emptyState(
        show === 'open' && !needle ? 'Nothing left to classify' : 'No UTMs here',
        show === 'open' && !needle ? 'Every UTM has a value in every column.' : 'Try another filter or search.',
      ) : null,
    );
  };

  function sheet(visible: Utm[]): HTMLElement {
    const el = h(
      'div',
      { class: 'sheet', role: 'table', 'aria-label': 'UTM table', 'aria-rowcount': visible.length + 1 },
      h('div', { class: 'sheet-row sheet-head', role: 'row' },
        ...PARTS.map((part, i) => h('div', { role: 'columnheader', class: `sheet-cell head col-utm${i === 0 ? ' col-freeze' : ''}` },
          h('span', { class: 'clip' }, `utm_${part}`), resizer(`utm_${part}`, `utm_${part}`))),
        ...table.columns.map((c, i) => columnHead(c, i)),
        h('div', { role: 'columnheader', class: 'sheet-cell head col-add' },
          h('a', { class: 'button button-ghost', href: hashFor('table', { column: 'new' }), title: 'Add a column' },
            icon('plus'), h('span', { class: 'sr-only' }, 'Add a column')))),
      ...visible.map((utm, r) => h(
        'div',
        { class: `sheet-row ${complete(utm) ? 'is-done' : 'is-open'}`, role: 'row' },
        ...PARTS.map((part, i) => partCell(utm, part, i)),
        ...table.columns.map((column, c) => classCell(utm, column, cellOf(grid, utm.key, column.id), {
          down: visible[r + 1]?.key,
          right: table.columns[c + 1]?.id,
          left: table.columns[c - 1]?.id,
        })),
        h('div', { class: 'sheet-cell col-add', role: 'cell' }),
      )),
    );
    el.style.gridTemplateColumns = template();
    return el;
  }

  /** Each column's track: the width someone dragged it to, or its natural size. */
  function template(): string {
    const track = (key: string, natural: string) => (widths[key] ? `${widths[key]}px` : natural);
    return [
      ...PARTS.map((part, i) => track(`utm_${part}`, i === 0 ? 'var(--freeze-col)' : 'minmax(90px, max-content)')),
      ...table.columns.map((c) => track(`col:${c.id}`, 'minmax(150px, 1fr)')),
      '48px',
    ].join(' ');
  }

  function setWidth(key: string, width: number | null): void {
    if (width === null) delete widths[key];
    else widths[key] = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)));
    const sheetEl = tableHost.querySelector<HTMLElement>('.sheet');
    if (sheetEl) sheetEl.style.gridTemplateColumns = template();
    resetWidths.hidden = !Object.keys(widths).length;
  }

  function finishResize(): void {
    // Forget widths of columns that no longer exist, then remember the rest.
    const keys = new Set([...PARTS.map((p) => `utm_${p}`), ...table.columns.map((c) => `col:${c.id}`)]);
    for (const key of Object.keys(widths)) if (!keys.has(key)) delete widths[key];
    saveWidths();
    syncScroll();
  }

  /** The grab handle on a header's right edge: drag it, use the arrow keys, or double-click to reset. */
  function resizer(key: string, label: string): HTMLElement {
    const handle = h('span', {
      class: 'col-resizer',
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-label': `Resize the ${label} column`,
      tabindex: 0,
      title: 'Drag to resize, double-click to reset. Arrow keys work too.',
    });
    const current = () => handle.parentElement?.getBoundingClientRect().width ?? 0;
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const start = current();
      const x0 = event.clientX;
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add('is-resizing');
      const move = (e: PointerEvent) => setWidth(key, start + e.clientX - x0);
      const end = () => {
        handle.removeEventListener('pointermove', move);
        document.body.classList.remove('is-resizing');
        finishResize();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end, { once: true });
      handle.addEventListener('pointercancel', end, { once: true });
    });
    handle.addEventListener('click', (event) => event.stopPropagation());
    handle.addEventListener('dblclick', (event) => {
      event.preventDefault();
      setWidth(key, null);
      finishResize();
    });
    handle.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 64 : 16;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        setWidth(key, current() + (event.key === 'ArrowRight' ? step : -step));
        finishResize();
      } else if (event.key === 'Delete' || event.key === 'Backspace' || event.key === 'Home') {
        event.preventDefault();
        setWidth(key, null);
        finishResize();
      }
    });
    return handle;
  }

  function columnHead(column: Column, i: number): HTMLElement {
    const c = cov.columns.find((x) => x.column.id === column.id)!;
    return h('div', { role: 'columnheader', class: `sheet-cell head col-class${i === 0 ? ' first' : ''}` },
      h('a', { class: 'col-head', href: hashFor('table', { show: show === 'all' ? null : show, column: column.id }), title: `${column.name}: rename, see its rules, or delete it` },
        h('span', { class: 'col-name' }, column.name, icon('down', 12)),
        h('span', { class: 'col-fill' }, meter(c.filled, cov.utms, `${column.name} filled`), fmtPct(c.filled, cov.utms))),
      resizer(`col:${column.id}`, column.name));
  }

  function partCell(utm: Utm, part: UtmPart, i: number): HTMLElement {
    const value = utm.raw[part];
    const others = utm.spellings.length > 1 ? `Also written as:\n${utm.spellings.slice(1).join('\n')}` : undefined;
    return h('div', { role: i === 0 ? 'rowheader' : 'cell', class: `sheet-cell col-utm${i === 0 ? ' col-freeze' : ''}${value ? '' : ' is-empty'}`, title: i === 0 && others ? `${value}\n\n${others}` : value || undefined },
      i === 0 && utm.spellings.length > 1 ? h('span', { class: 'spellings', title: others }, `×${utm.spellings.length}`) : null,
      h('span', { class: 'clip' }, value || '–'));
  }

  function classCell(utm: Utm, column: Column, cell: Cell, next: { down?: string; right?: string; left?: string }): HTMLElement {
    const td = h('div', { role: 'cell', class: `sheet-cell col-class cell cell-${cell.from}${column.id === table.columns[0]?.id ? ' first' : ''}`, 'data-utm': utm.key, 'data-col': column.id });
    if (editing?.utm === utm.key && editing.column === column.id) {
      td.append(editor(utm, column, cell, next));
      return td;
    }
    const why = cell.from === 'rule'
      ? `Filled by a rule: ${describeRule(cell.rule!, table)}.`
      : cell.from === 'typed'
        ? `Typed by a person.${cell.rule ? ` The rules would say ${cell.rule.value}.` : ''}`
        : 'Empty.';
    const start = (initial?: string) => {
      editing = { utm: utm.key, column: column.id, initial };
      ctx.render();
    };
    td.append(h(
      'button',
      {
        type: 'button',
        class: 'cell-button',
        title: `${why} Click to type a value.`,
        'aria-label': `${column.name} for ${displayUtm(utm.raw)}: ${cell.value || 'empty'}. ${why}`,
        onclick: () => start(),
        onkeydown: (event: Event) => {
          const key = (event as KeyboardEvent);
          if (key.key.length === 1 && !key.ctrlKey && !key.metaKey && !key.altKey && key.key !== ' ') {
            event.preventDefault();
            start(key.key);
          } else if (key.key === 'Delete' || key.key === 'Backspace') {
            event.preventDefault();
            if (cell.from === 'typed') ctx.commit(setCell(table, utm, column.id, ''));
          }
        },
      },
      cell.from === 'rule' ? icon('bolt', 12) : cell.from === 'typed' ? icon('pencil', 12) : null,
      h('span', { class: 'cell-text' }, cell.value || '–'),
    ));
    return td;
  }

  function editor(utm: Utm, column: Column, cell: Cell, next: { down?: string; right?: string; left?: string }): HTMLElement {
    const input = h('input', {
      class: 'cell-input',
      value: editing?.initial ?? cell.value,
      list: `values-${column.id}`,
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: cell.rule ? cell.rule.value : 'Type a value',
      'aria-label': `${column.name} for ${displayUtm(utm.raw)}. Enter saves, Escape cancels.`,
    });
    let done = false;
    detachEditor = () => {
      done = true;
    };
    const finish = (save: boolean, then: { utm: string; column: string } | null) => {
      if (done) return;
      done = true;
      editing = null;
      focusAfter = then;
      const draft = save ? editDraft(utm, column, cell, input.value) : null;
      if (draft === 'rule-filled') {
        ctx.toast(`This ${column.name} comes from a rule. Type a different value to override it, or change the rule.`);
        ctx.render();
      } else if (draft) {
        const typed = draft.op.type === 'setCell' && draft.op.value;
        ctx.commit(draft, {
          actions: typed ? [{ label: 'Make it a rule', run: () => ctx.go(ruleFromCell(utm, column, draft.op.type === 'setCell' ? draft.op.value ?? '' : '')) }] : [],
        });
      } else ctx.render();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true, next.down ? { utm: next.down, column: column.id } : { utm: utm.key, column: column.id });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false, { utm: utm.key, column: column.id });
      } else if (event.key === 'Tab') {
        const to = event.shiftKey ? next.left : next.right;
        if (to) {
          event.preventDefault();
          finish(true, { utm: utm.key, column: to });
        }
      }
    });
    input.addEventListener('blur', () => finish(true, null));
    return h('div', { class: 'cell-editor' }, input,
      h('span', { class: 'cell-hint' }, cell.from === 'rule' ? `Rule says ${cell.rule!.value}. Type to override.` : 'Enter to save · Esc to cancel'));
  }

  /** What typing `text` in a cell means: a change, nothing, or a hint that a rule fills it. */
  function editDraft(utm: Utm, column: Column, cell: Cell, text: string) {
    const value = text.trim() ? canonicalValue(table, column.id, text) : '';
    if (!value) {
      if (cell.from === 'typed') return setCell(table, utm, column.id, '');
      return cell.from === 'rule' && text !== cell.value ? 'rule-filled' as const : null;
    }
    if (value === cell.value) return null;
    return setCell(table, utm, column.id, value);
  }

  /** A rule that would give every UTM like this one the value just typed. */
  function ruleFromCell(utm: Utm, column: Column, value: string): string {
    const used = rulesFor(table, column.id).map((r) => r.when[0]!.part);
    const part = used.sort((a, b) => used.filter((p) => p === b).length - used.filter((p) => p === a).length)[0] ?? 'campaign';
    return hashFor('rules', { column: column.id, part, op: 'is', text: utm.raw[part] || utm.parts[part], value });
  }

  renderTable();

  // Sideways scrolling: buttons beside the table, and a shadow on the frozen column once it has something under it.
  const scrollLeftButton = button(null, { kind: 'ghost', icon: 'left', label: 'Scroll columns left', title: 'Scroll left (or Shift + scroll wheel)', onClick: () => slide(-1) });
  const scrollRightButton = button(null, { kind: 'ghost', icon: 'right', label: 'Scroll columns right', title: 'Scroll right (or Shift + scroll wheel)', onClick: () => slide(1) });
  const scroller = h('span', { class: 'scroller' }, scrollLeftButton, scrollRightButton);
  const resetWidths = button('Reset widths', {
    kind: 'ghost',
    title: 'Put every column back to its natural width',
    onClick: () => {
      widths = {};
      saveWidths();
      setWidth('', null);
      syncScroll();
    },
  });
  resetWidths.classList.add('reset-widths');
  resetWidths.hidden = !Object.keys(widths).length;
  function frozenWidth(): number {
    return tableHost.querySelector<HTMLElement>('.head.col-freeze')?.offsetWidth ?? 0;
  }
  function slide(direction: -1 | 1): void {
    const step = Math.max(160, (tableHost.clientWidth - frozenWidth()) * 0.8);
    tableHost.scrollBy({ left: direction * step, behavior: 'smooth' });
  }
  function syncScroll(): void {
    const max = tableHost.scrollWidth - tableHost.clientWidth;
    holdFrozen();
    tableHost.classList.toggle('is-scrolled', tableHost.scrollLeft > 0);
    scroller.hidden = max <= 1;
    scrollLeftButton.disabled = tableHost.scrollLeft <= 0;
    scrollRightButton.disabled = tableHost.scrollLeft >= max - 1;
    // Keep focused cells clear of the frozen column and the header row.
    tableHost.style.scrollPaddingLeft = `${frozenWidth()}px`;
    tableHost.style.scrollPaddingTop = `${tableHost.querySelector<HTMLElement>('.head')?.offsetHeight ?? 0}px`;
  }
  // The safety net: if this browser doesn't keep the first column and the header row
  // pinned while the table scrolls, hold them in place by hand.
  function holdFrozen(): void {
    const corner = tableHost.querySelector<HTMLElement>('.head.col-freeze');
    if (!corner) return;
    if (!tableHost.classList.contains('hold')) {
      const box = tableHost.getBoundingClientRect();
      const at = corner.getBoundingClientRect();
      const slipped = (tableHost.scrollLeft > 0 && Math.abs(at.left - box.left - tableHost.clientLeft) > 2)
        || (tableHost.scrollTop > 0 && Math.abs(at.top - box.top - tableHost.clientTop) > 2);
      if (!slipped) return;
      tableHost.classList.add('hold');
      heldByHand = true;
    }
    tableHost.style.setProperty('--hold-x', `${tableHost.scrollLeft}px`);
    tableHost.style.setProperty('--hold-y', `${tableHost.scrollTop}px`);
  }
  if (heldByHand) tableHost.classList.add('hold');
  // On a big enough screen the table fills the rest of it, so its sideways scrollbar is in view from the start.
  // On a small one it's one screen tall, and the page scrolls to it.
  fitTable = () => {
    const room = window.innerHeight - (tableHost.getBoundingClientRect().top + window.scrollY) - 24;
    tableHost.style.maxHeight = room >= 420 ? `${Math.floor(room)}px` : '';
  };
  tableHost.addEventListener('scroll', syncScroll, { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    resizeWatch = new ResizeObserver(syncScroll);
    resizeWatch.observe(tableHost);
  }

  requestAnimationFrame(() => {
    fitTable?.();
    syncScroll();
    if (editing) {
      const input = tableHost.querySelector<HTMLInputElement>('.cell-input');
      input?.focus();
      if (input && !editing.initial) input.select();
      else if (input) input.setSelectionRange(input.value.length, input.value.length);
    } else if (focusAfter) {
      tableHost.querySelector<HTMLElement>(`[data-utm="${CSS.escape(focusAfter.utm)}"][data-col="${CSS.escape(focusAfter.column)}"] .cell-button`)?.focus();
      focusAfter = null;
    }
  });

  const search = h('input', {
    id: 'utm-search',
    type: 'search',
    value: query,
    placeholder: 'Search UTMs and values',
    'aria-label': 'Search UTMs and values',
    oninput: (event: Event) => {
      query = (event.target as HTMLInputElement).value;
      shown = PAGE_SIZE;
      renderTable();
    },
  });

  function matchesSearch(utm: Utm, needle: string): boolean {
    return utm.key.includes(needle)
      || utm.spellings.some((s) => normalizeText(s).includes(needle))
      || table.columns.some((c) => normalizeText(cellOf(grid, utm.key, c.id).value).includes(needle));
  }

  const drawerId = params.get('column');
  const closeHref = here(show);
  const drawerEl = params.get('add')
    ? addUtmsDrawer(ctx, closeHref)
    : drawerId ? columnDrawer(ctx, drawerId, closeHref) : null;

  return h(
    'div',
    { class: 'view view-table' },
    pageHeader(
      'UTM table',
      'One shared, versioned table where your team classifies every UTM, so every report agrees on what a campaign was.',
      linkButton('Add UTMs', hashFor('table', { add: '1' }), { icon: 'plus', kind: 'primary' }),
      button('Export CSV', {
        icon: 'download',
        onClick: () => downloadText(tableCsv(table, grid, ctx.version),
          `utmdm-${ctx.ws.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-v${ctx.version}.csv`, 'text/csv'),
      }),
    ),
    about(),
    h('div', { class: 'table-top' }, summary(), tip()),
    h('div', { class: 'toolbar' },
      h('nav', { class: 'segmented', 'aria-label': 'Filter UTMs' },
        ...([['all', 'All'], ['open', 'Needs values'], ['done', 'Complete']] as const).map(([s, label]) =>
          h('a', { href: here(s), class: 'segment', 'aria-current': s === show ? 'true' : null },
            label, h('span', { class: 'segment-count' }, fmtInt(base.filter((u) => inShow(u, s)).length))))),
      h('label', { class: 'search' }, icon('search', 16), search),
      linkButton('Add column', hashFor('table', { column: 'new', show: show === 'all' ? null : show }), { icon: 'columns' }),
    ),
    emptyIn
      ? h('p', { class: 'filter-note' }, `Showing UTMs with no ${emptyIn.name} yet. `, h('a', { href: hashFor('table', { show: show === 'all' ? null : show }) }, 'Show every UTM'))
      : null,
    h('div', { class: 'table-meta' }, countLine,
      h('p', { class: 'legend' },
        h('span', { class: 'legend-item' }, h('span', { class: 'legend-swatch cell-rule' }, icon('bolt', 12)), 'filled by a rule'),
        h('span', { class: 'legend-item' }, h('span', { class: 'legend-swatch cell-typed' }, icon('pencil', 12)), 'typed'),
        h('span', { class: 'legend-item' }, h('span', { class: 'legend-swatch cell-empty' }, '–'), 'needs a value')),
      resetWidths,
      scroller),
    table.utms.length
      ? tableHost
      : emptyState('No UTMs yet', 'Paste tagged links or rows from a spreadsheet to start your table.',
        linkButton('Add UTMs', hashFor('table', { add: '1' }), { icon: 'plus', kind: 'primary' })),
    drawerEl,
  );

  function summary(): HTMLElement {
    const rules = table.rules.length;
    return h(
      'section',
      { class: 'summary card', 'aria-label': 'How much is classified' },
      h(
        'div',
        { class: 'summary-main' },
        h('p', { class: 'eyebrow' }, 'Fully classified'),
        h('p', { class: 'hero-figure' }, fmtPct(cov.complete, cov.utms)),
        meter(cov.complete, cov.utms, 'UTMs with every column filled', 'big'),
        h('p', { class: 'summary-text' },
          table.columns.length
            ? [`${fmtInt(cov.complete)} of ${plural(cov.utms, 'UTM')} have a value in every column. `,
              open ? h('a', { href: hashFor('table', { show: 'open' }) }, `${fmtInt(open)} still need at least one`) : 'Nothing is outstanding.',
              open ? '.' : '']
            : 'Add a column to start classifying.'),
      ),
      h(
        'div',
        { class: 'summary-side' },
        stat('bolt', 'Filled by rules', fmtInt(cov.byRule), `cells, from ${plural(rules, 'rule')}`),
        stat('pencil', 'Typed by people', fmtInt(cov.typed), 'cells'),
        stat('outstanding', 'Empty', fmtInt(cov.empty), `of ${fmtInt(cov.cells)} cells`),
      ),
    );
  }

  function tip(): HTMLElement | null {
    let hidden = false;
    try {
      hidden = localStorage.getItem(TIP_KEY) === '1';
    } catch {
      // show it
    }
    if (hidden || !table.utms.length) return null;
    const type = table.columns.find((c) => c.name === 'Type');
    const box: HTMLElement = h(
      'section',
      { class: 'tip card', 'aria-label': 'How it works' },
      h('div', { class: 'card-head' }, h('h2', null, 'Three ways to classify'),
        button(null, {
          kind: 'ghost', icon: 'close', label: 'Hide these tips', title: 'Hide these tips',
          onClick: () => {
            try {
              localStorage.setItem(TIP_KEY, '1');
            } catch {
              // hidden for this visit
            }
            ctx.render();
          },
        })),
      h(
        'ol',
        { class: 'tip-steps' },
        h('li', null, h('strong', null, 'Type in a cell. '), 'Click any empty cell, type a value and press Enter. It sticks to that one UTM.'),
        h('li', null, h('strong', null, 'Write a rule. '), 'One sentence fills every matching UTM, now and when new ones arrive. ',
          type ? h('a', { href: hashFor('rules', { column: type.id, part: 'campaign', op: 'contains', text: 'cup', value: 'Marketing' }) },
            'Try: if campaign contains "cup", then Type is Marketing') : null),
        h('li', null, h('strong', null, 'Add a column. '), 'Anything your team needs to know about a UTM, like Region or Agency. ',
          h('a', { href: hashFor('table', { column: 'new' }) }, 'Add one')),
      ),
      h('p', { class: 'tip-foot' }, icon('restore', 14), 'Every change is saved as a version, so nothing you try here is permanent. Undo is in the message after each save, and in History.'),
    );
    return box;
  }
}

/** What UTMDM is for, who it's for, and why it helps: the first thing a new visitor reads. */
function about(): HTMLElement {
  const item = (iconName: IconName, title: string, text: string) =>
    h('div', { class: 'about-item' }, h('h2', null, icon(iconName, 16), title), h('p', null, text));
  return h('section', { class: 'about', 'aria-label': 'About UTMDM' },
    item('columns', "What it's for",
      'UTMs are typed by hand, so one campaign turns up as fb, Facebook and FB_Paid. UTMDM turns them into clean, agreed values ' +
      '(Channel, Campaign, Type, or any column you add) that reports can group and join on.'),
    item('user', "Who it's for",
      'Data-focused marketers and marketing-focused data people: whoever owns the campaign naming, and gets asked why two dashboards disagree.'),
    item('check', 'Why it helps',
      'One place instead of private spreadsheets. Rules classify new UTMs as they arrive, typed fixes stick, and every change is versioned ' +
      'with who made it, so a number in a report can be traced back and trusted.'));
}

function stat(iconName: 'bolt' | 'pencil' | 'outstanding', label: string, value: string, detail: string): HTMLElement {
  return h('div', { class: 'stat' },
    h('p', { class: `stat-label stat-${iconName}` }, icon(iconName, 14), label),
    h('p', { class: 'stat-value' }, value),
    h('p', { class: 'stat-detail' }, detail));
}
