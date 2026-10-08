import { historyEntries, restore } from '../../core/workspace';
import { button, pageHeader } from '../components';
import type { Ctx } from '../ctx';
import { h } from '../dom';
import { fmtDateTime, fmtInt, fmtPct, plural, timeAgo } from '../format';
import { icon } from '../icons';
import { hashFor } from '../routes';

const PAGE = 30;
let shown = PAGE;

export function historyView(ctx: Ctx): HTMLElement {
  const { book } = ctx;
  const entries = historyEntries(book).reverse();
  const current = ctx.version;

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
        h('h2', null, 'How versions work'),
        h('p', { class: 'card-intro' },
          'TagFluent keeps a list of what was done: added these UTMs, added this rule, typed this value. Any version of the table is that list replayed up to that point, ' +
          'the way a bank balance is the sum of its transactions.'),
        h('p', { class: 'card-intro' }, 'That is why a restore never loses anything: it is one more entry on the list, and it can be undone like any other.'),
        h('p', { class: 'card-intro' }, 'Backups and exports are on ', h('a', { href: hashFor('data') }, 'Import & export'), '.'),
      ),
    ),
  );
}
