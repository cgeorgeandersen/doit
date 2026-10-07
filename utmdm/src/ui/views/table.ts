import { tableCsv } from '../../core/csv';
import type { Column, Utm } from '../../core/model';
import { UTM_PARTS, type UtmPart } from '../../core/model';
import { displayUtm, normalizeText } from '../../core/normalize';
import { describeRule } from '../../core/rules';
import { canonicalValue, cellOf, columnValues, coverage, isComplete, rulesFor, sortedUtms, type Cell } from '../../core/table';
import { setCell } from '../../core/workspace';
import { button, emptyState, linkButton, meter, pageHeader } from '../components';
import type { Ctx } from '../ctx';
import { fill, h } from '../dom';
import { fmtInt, fmtPct, plural } from '../format';
import { icon } from '../icons';
import { hashFor } from '../routes';
import { addUtmsDrawer } from './add-utms';
import { columnDrawer } from './column-drawer';
import { downloadText } from './download';

type Show = 'all' | 'open' | 'done';
const PAGE_SIZE = 100;
const TIP_KEY = 'utmdm-tip-hidden';

// Kept between renders, so a save doesn't lose your place.
let query = '';
let shown = PAGE_SIZE;
let editing: { utm: string; column: string; initial?: string } | null = null;
let focusAfter: { utm: string; column: string } | null = null;
let detachEditor: (() => void) | null = null;

export function tableView(ctx: Ctx): HTMLElement {
  detachEditor?.();
  detachEditor = null;
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
      h(
        'table',
        { class: 'utm-table' },
        h('thead', null, h('tr', null,
          ...UTM_PARTS.map((part) => h('th', { scope: 'col', class: 'col-utm' }, `utm_${part}`)),
          ...table.columns.map((c, i) => columnHead(c, i)),
          h('th', { class: 'col-add' }, h('a', { class: 'button button-ghost', href: hashFor('table', { column: 'new' }), title: 'Add a column' },
            icon('plus'), h('span', { class: 'sr-only' }, 'Add a column'))))),
        h('tbody', null,
          ...visible.map((utm, r) => h(
            'tr',
            { class: complete(utm) ? 'is-done' : 'is-open' },
            ...UTM_PARTS.map((part, i) => partCell(utm, part, i)),
            ...table.columns.map((column, c) => classCell(utm, column, cellOf(grid, utm.key, column.id), {
              down: visible[r + 1]?.key,
              right: table.columns[c + 1]?.id,
              left: table.columns[c - 1]?.id,
            })),
            h('td', { class: 'col-add' }),
          ))),
      ),
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

  function columnHead(column: Column, i: number): HTMLElement {
    const c = cov.columns.find((x) => x.column.id === column.id)!;
    return h('th', { scope: 'col', class: `col-class${i === 0 ? ' first' : ''}` },
      h('a', { class: 'col-head', href: hashFor('table', { show: show === 'all' ? null : show, column: column.id }), title: `${column.name}: rename, see its rules, or delete it` },
        h('span', { class: 'col-name' }, column.name, icon('down', 12)),
        h('span', { class: 'col-fill' }, meter(c.filled, cov.utms, `${column.name} filled`), fmtPct(c.filled, cov.utms))));
  }

  function partCell(utm: Utm, part: UtmPart, i: number): HTMLElement {
    const value = utm.raw[part];
    const others = utm.spellings.length > 1 ? `Also written as:\n${utm.spellings.slice(1).join('\n')}` : undefined;
    return h('td', { class: `col-utm${value ? '' : ' is-empty'}`, title: i === 0 && others ? others : value || undefined },
      i === 0 && utm.spellings.length > 1 ? h('span', { class: 'spellings', title: others }, `×${utm.spellings.length}`) : null,
      value || '–');
  }

  function classCell(utm: Utm, column: Column, cell: Cell, next: { down?: string; right?: string; left?: string }): HTMLElement {
    const td = h('td', { class: `col-class cell cell-${cell.from}${column.id === table.columns[0]?.id ? ' first' : ''}`, 'data-utm': utm.key, 'data-col': column.id });
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
  requestAnimationFrame(() => {
    if (editing) {
      const input = tableHost.querySelector<HTMLInputElement>('.cell-input');
      input?.focus();
      if (input && !editing.initial) input.select();
      else if (input) input.setSelectionRange(input.value.length, input.value.length);
    } else if (focusAfter) {
      tableHost.querySelector<HTMLElement>(`td[data-utm="${CSS.escape(focusAfter.utm)}"][data-col="${CSS.escape(focusAfter.column)}"] .cell-button`)?.focus();
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
      'Every UTM your team uses, in one shared table. Type a value in any cell, or write a rule once and let it fill the column.',
      linkButton('Add UTMs', hashFor('table', { add: '1' }), { icon: 'plus', kind: 'primary' }),
      button('Export CSV', {
        icon: 'download',
        onClick: () => downloadText(tableCsv(table, grid, ctx.version),
          `utmdm-${ctx.ws.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-v${ctx.version}.csv`, 'text/csv'),
      }),
    ),
    summary(),
    tip(),
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
        h('span', { class: 'legend-item' }, h('span', { class: 'legend-swatch cell-empty' }, '–'), 'needs a value'))),
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
            box.remove();
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

function stat(iconName: 'bolt' | 'pencil' | 'outstanding', label: string, value: string, detail: string): HTMLElement {
  return h('div', { class: 'stat' },
    h('p', { class: `stat-label stat-${iconName}` }, icon(iconName, 14), label),
    h('p', { class: 'stat-value' }, value),
    h('p', { class: 'stat-detail' }, detail));
}
