import { utmStatus } from '../../core/classify';
import { utmTableCsv } from '../../core/csv';
import type { Utm } from '../../core/model';
import { UTM_PARTS } from '../../core/model';
import { button, outcomeCell, pageHeader } from '../components';
import type { Ctx } from '../ctx';
import { fill, h } from '../dom';
import { fmtInt } from '../format';
import { icon } from '../icons';
import { hashFor } from '../routes';
import { downloadText } from './download';
import { utmDrawer } from './utm-drawer';
import { latestNewKeys } from '../../core/workspace';

type Filter = 'all' | 'outstanding' | 'conflict' | 'classified' | 'new';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'outstanding', label: 'Outstanding' },
  { id: 'conflict', label: 'Conflicts' },
  { id: 'classified', label: 'Classified' },
  { id: 'new', label: 'New in last refresh' },
];
const PAGE_SIZE = 100;

// Kept between renders, so typing in the search box survives a save.
let query = '';
let shown = PAGE_SIZE;

export function utmsView(ctx: Ctx): HTMLElement {
  const { ws, results, params } = ctx;
  const filter = (FILTERS.find((f) => f.id === params.get('status'))?.id ?? 'all') as Filter;
  const fieldId = params.get('field');
  const field = ws.fields.find((f) => f.id === fieldId);
  const selected = params.get('utm');
  const newKeys = latestNewKeys(ws);

  const status = (utm: Utm) => utmStatus(results.get(utm.key));
  const passes = (utm: Utm, f: Filter) =>
    f === 'all' || (f === 'new' ? newKeys.has(utm.key) : status(utm) === f);
  const byTraffic = [...ws.utms].sort((a, b) => b.sessions - a.sessions || a.key.localeCompare(b.key));
  const base = field ? byTraffic.filter((u) => results.get(u.key)?.[field.id]?.status !== 'classified') : byTraffic;
  const here = (f: Filter) => hashFor('utms', { status: f === 'all' ? null : f, field: fieldId });

  const tableHost = h('div', { class: 'table-wrap' });
  const countLine = h('p', { class: 'table-count', 'aria-live': 'polite' });
  const renderTable = () => {
    const needle = query.trim().toLowerCase();
    const rows = base.filter((u) => passes(u, filter) && (!needle || u.key.includes(needle) || u.spellings.some((s) => s.toLowerCase().includes(needle))));
    countLine.textContent = `${fmtInt(rows.length)} ${rows.length === 1 ? 'UTM' : 'UTMs'}, most traffic first`;
    fill(
      tableHost,
      h(
        'table',
        { class: 'utm-table' },
        h('thead', null, h('tr', null,
          ...UTM_PARTS.map((part) => h('th', { scope: 'col', class: 'col-utm' }, `utm_${part}`)),
          h('th', { scope: 'col', class: 'num' }, 'Sessions'),
          ...ws.fields.map((f, i) => h('th', { scope: 'col', class: i === 0 ? 'col-class first' : 'col-class' }, f.name)))),
        h('tbody', null,
          ...rows.slice(0, shown).map((utm) => {
            const open = () => ctx.go(hashFor('utms', { status: filter === 'all' ? null : filter, field: fieldId, utm: utm.key }));
            return h(
              'tr',
              {
                class: `row-${status(utm)}${utm.key === selected ? ' is-selected' : ''}`,
                tabindex: 0,
                'aria-label': `${utm.spellings[0]}, ${status(utm)}`,
                onclick: open,
                onkeydown: (event: Event) => {
                  if ((event as KeyboardEvent).key === 'Enter') open();
                },
              },
              ...UTM_PARTS.map((part, i) =>
                h('td', { class: `col-utm${utm.raw[part] ? '' : ' is-empty'}`, title: utm.raw[part] || undefined },
                  i === 0 && newKeys.has(utm.key) ? h('span', { class: 'badge-new' }, 'New') : null,
                  utm.raw[part] || '–')),
              h('td', { class: 'num' }, fmtInt(utm.sessions)),
              ...ws.fields.map((f, i) => h('td', { class: i === 0 ? 'col-class first' : 'col-class' }, outcomeCell(results.get(utm.key)?.[f.id]))),
            );
          })),
      ),
      rows.length > shown
        ? h('div', { class: 'table-more' }, button(`Show ${fmtInt(Math.min(PAGE_SIZE, rows.length - shown))} more`, {
          onClick: () => {
            shown += PAGE_SIZE;
            renderTable();
          },
        }))
        : null,
    );
  };
  renderTable();

  const search = h('input', {
    id: 'utm-search',
    type: 'search',
    value: query,
    placeholder: 'Search UTMs',
    'aria-label': 'Search UTMs',
    oninput: (event: Event) => {
      query = (event.target as HTMLInputElement).value;
      shown = PAGE_SIZE;
      renderTable();
    },
  });

  const utm = selected ? ws.utms.find((u) => u.key === selected) : undefined;
  return h(
    'div',
    { class: 'view view-utms' },
    pageHeader(
      'UTM table',
      'Every UTM ever seen, kept for good. Spellings that differ only in capitals, spaces or URL encoding are merged into one row.',
      button('Export CSV', {
        icon: 'download',
        onClick: () => downloadText(utmTableCsv(ws, results),
          `utmdm-utm-table-v${ws.versions.at(-1)?.number ?? 0}-${ctx.now().slice(0, 10)}.csv`, 'text/csv'),
      }),
    ),
    h(
      'div',
      { class: 'toolbar' },
      h('nav', { class: 'segmented', 'aria-label': 'Filter UTMs' },
        ...FILTERS.map((f) =>
          h('a', { href: here(f.id), class: 'segment', 'aria-current': f.id === filter ? 'true' : null },
            f.label, h('span', { class: 'segment-count' }, fmtInt(base.filter((u) => passes(u, f.id)).length))))),
      h('label', { class: 'search' }, icon('search', 16), search),
    ),
    field
      ? h('p', { class: 'filter-note' }, `Showing UTMs that still need a ${field.name.toLowerCase()}. `,
        h('a', { href: hashFor('utms', { status: filter === 'all' ? null : filter }) }, 'Show every classification'))
      : null,
    countLine,
    tableHost,
    utm ? utmDrawer(ctx, utm, hashFor('utms', { status: filter === 'all' ? null : filter, field: fieldId })) : null,
  );
}
