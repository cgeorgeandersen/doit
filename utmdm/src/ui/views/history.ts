import { tableCsv } from '../../core/csv';
import { createDemoWorkspace } from '../../core/demo';
import { parseWorkspace } from '../../core/store';
import { historyEntries, restore } from '../../core/workspace';
import { button, pageHeader } from '../components';
import type { Ctx } from '../ctx';
import { h } from '../dom';
import { fmtDateTime, fmtInt, fmtPct, plural, timeAgo } from '../format';
import { icon } from '../icons';
import { downloadText } from './download';

const PAGE = 30;
let shown = PAGE;

export function historyView(ctx: Ctx): HTMLElement {
  const { ws, book } = ctx;
  const entries = historyEntries(book).reverse();
  const current = ctx.version;

  const file = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    id: 'restore-file',
    class: 'sr-only',
    onchange: async (e: Event) => {
      const chosen = (e.target as HTMLInputElement).files?.[0];
      if (!chosen) return;
      try {
        const backup = parseWorkspace(await chosen.text());
        if (window.confirm(`Replace this workspace with the backup of ${backup.name} (${plural(backup.changes.length, 'version')})?`)) {
          ctx.replace(backup, `Restored the backup of ${backup.name}.`);
        }
      } catch (error) {
        ctx.toast(error instanceof Error && error.message.startsWith('That file') ? error.message : "That file isn't a UTMDM backup.");
      }
    },
  });

  return h(
    'div',
    { class: 'view view-history' },
    pageHeader('History',
      'Every change anyone makes is saved as a numbered version: who, when and what. Restore any version. Restoring is a change too, so nothing is ever lost.'),
    h('div', { class: 'split split-wide' },
      h(
        'section',
        { class: 'card split-main' },
        h('div', { class: 'card-head' }, h('h2', null, `${plural(current, 'version')}`),
          h('p', { class: 'card-intro' }, 'Newest first, with how much of the table was fully classified after each change.')),
        h(
          'ol',
          { class: 'timeline' },
          ...entries.slice(0, shown).map(({ change, complete, utms, columns }, i) => {
            const before = entries[i + 1];
            const delta = before ? complete - before.complete : complete;
            const restoring = change.op.type === 'restore';
            const newColumn = change.op.type === 'addColumn';
            return h(
              'li',
              { class: `event${change.version === current ? ' is-current' : ''}` },
              h('span', { class: 'event-version' }, `v${change.version}`),
              h('div', { class: 'event-body' },
                h('p', { class: 'event-summary' }, change.summary),
                h('p', { class: 'event-meta' },
                  h('span', { class: 'event-author' }, icon('user', 13), change.author),
                  h('time', { datetime: change.at, title: fmtDateTime(change.at) }, timeAgo(change.at)),
                  columns
                    ? h('span', { class: 'event-cover', title: 'UTMs with a value in every column after this change' },
                      `${fmtPct(complete, utms)} fully classified`,
                      delta && !restoring ? h('span', { class: delta > 0 ? 'delta-up' : 'delta-down' }, ` ${delta > 0 ? '+' : '−'}${fmtInt(Math.abs(delta))}`) : null,
                      newColumn && delta < 0 ? ' until the new column is filled' : null)
                    : h('span', { class: 'event-cover' }, 'no columns yet'))),
              change.version === current
                ? h('span', { class: 'badge' }, 'Current')
                : button('Restore', {
                  kind: 'ghost',
                  icon: 'restore',
                  title: `Make the table what it was at version ${change.version}`,
                  onClick: () => ctx.commit(restore(change.version)),
                }),
            );
          }),
        ),
        entries.length > shown
          ? h('div', { class: 'table-more' }, button(`Show ${fmtInt(Math.min(PAGE, entries.length - shown))} older`, {
            onClick: () => {
              shown += PAGE;
              ctx.render();
            },
          }))
          : null,
      ),
      h(
        'section',
        { class: 'card split-side' },
        h('h2', null, 'Your data'),
        h('p', { class: 'card-intro' },
          'This demo keeps the workspace in this browser, so clearing the browser clears it. Export the table, or download a backup of every version, any time.'),
        h('div', { class: 'data-actions' },
          button('Export the table (CSV)', {
            icon: 'download',
            onClick: () => downloadText(tableCsv(ctx.table, ctx.grid, current), `utmdm-table-v${current}.csv`, 'text/csv'),
          }),
          button('Download a backup', {
            icon: 'download',
            onClick: () => downloadText(JSON.stringify(ws), `utmdm-backup-v${current}-${ctx.now().slice(0, 10)}.json`, 'application/json'),
          }),
          h('label', { class: 'button button-secondary', for: 'restore-file' }, icon('upload'), 'Restore a backup', file),
          button('Start the demo over', {
            kind: 'danger',
            icon: 'restore',
            onClick: () => {
              if (!window.confirm('Start the demo over? Everything you changed in this browser goes.')) return;
              shown = PAGE;
              ctx.replace({ ...createDemoWorkspace(ctx.now()), user: ws.user }, 'The demo is back to where it started.');
            },
          })),
      ),
    ),
  );
}
