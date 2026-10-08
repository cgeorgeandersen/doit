import { describeWhen } from '../../core/rules';
import { cellOf, coverage, keptUtms, rulesFor } from '../../core/table';
import { addColumn, columnNameProblem, deleteColumn, renameColumn } from '../../core/workspace';
import { button, drawer, field, linkButton, meter } from '../components';
import type { Ctx } from '../ctx';
import { h } from '../dom';
import { fmtInt, fmtPct, plural } from '../format';
import { hashFor } from '../routes';

/** Adding a column (`id` is "new"), or one column's details: its values, its rules, rename and delete. */
export function columnDrawer(ctx: Ctx, id: string, closeHref: string): HTMLElement | null {
  const { table, grid } = ctx;
  if (id === 'new') return newColumn(ctx, closeHref);
  const column = table.columns.find((c) => c.id === id);
  if (!column) return null;

  const cov = coverage(table, grid).columns.find((c) => c.column.id === id)!;
  const utms = keptUtms(table);
  const total = utms.length;
  const empty = total - cov.filled;
  const counts = new Map<string, number>();
  for (const utm of utms) {
    const value = cellOf(grid, utm.key, id).value;
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const rules = rulesFor(table, id);

  const name = h('input', { id: 'column-name', value: column.name, maxlength: 40, autocomplete: 'off' });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const rename = (event: Event) => {
    event.preventDefault();
    const problem = columnNameProblem(table, name.value, id);
    if (problem) {
      error.textContent = problem;
      return;
    }
    ctx.commit(renameColumn(table, id, name.value));
  };

  return drawer(
    column.name,
    closeHref,
    h('section', { class: 'drawer-section' },
      h('p', { class: 'drawer-figure' }, fmtPct(cov.filled, total), h('span', null, ' filled')),
      meter(cov.filled, total, `${column.name} filled`),
      h('p', { class: 'drawer-text' }, `${fmtInt(cov.filled)} of ${plural(total, 'UTM')} have a ${column.name}: `,
        `${fmtInt(cov.byRule)} from rules, ${fmtInt(cov.typed)} typed. `,
        empty ? h('a', { href: hashFor('table', { empty: id }) }, `Show the ${fmtInt(empty)} empty`) : 'None are empty.')),
    h('section', { class: 'drawer-section' },
      h('h3', null, 'Values in use'),
      counts.size
        ? h('ul', { class: 'value-list' }, ...[...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value, n]) =>
          h('li', { class: 'value-chip' }, value, h('span', { class: 'value-count' }, fmtInt(n)))))
        : h('p', { class: 'muted' }, 'None yet. Type a value in the table or add a rule.'),
      h('p', { class: 'field-hint' }, 'A value typed with different capitals or spaces snaps to the one already here, so "paid social" never sits next to "Paid Social".')),
    h('section', { class: 'drawer-section' },
      h('div', { class: 'section-head' }, h('h3', null, `Rules (${rules.length})`),
        linkButton('Add a rule', hashFor('rules', { column: id }), { icon: 'plus', kind: 'ghost' })),
      rules.length
        ? h('ol', { class: 'mini-rules' }, ...rules.map((r) => h('li', null, `If ${describeWhen(r.when)} → `, h('strong', null, r.value))))
        : h('p', { class: 'muted' }, 'No rules yet, so every value here is typed by hand.')),
    h('form', { class: 'drawer-section form', onsubmit: rename },
      field('Name', name),
      error,
      h('div', { class: 'form-actions' }, button('Rename', { type: 'submit' }))),
    h('section', { class: 'drawer-section drawer-foot' },
      button('Delete this column', {
        kind: 'danger',
        icon: 'trash',
        onClick: () => {
          const draft = deleteColumn(table, id);
          if (!window.confirm(`${draft.summary}?\n\nYou can bring it back from History.`)) return;
          ctx.go(closeHref);
          ctx.commit(draft);
        },
      })),
  );
}

function newColumn(ctx: Ctx, closeHref: string): HTMLElement {
  const name = h('input', { id: 'new-column-name', placeholder: 'Region, Agency, Budget owner…', maxlength: 40, autocomplete: 'off', 'data-autofocus': true });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const add = (event: Event) => {
    event.preventDefault();
    const problem = columnNameProblem(ctx.table, name.value);
    if (problem) {
      error.textContent = problem;
      name.focus();
      return;
    }
    const draft = addColumn(ctx.book, name.value);
    ctx.go(closeHref);
    ctx.commit(draft, {
      message: `Saved as version ${ctx.version + 1}. ${draft.summary}. Fill it by typing in its cells, or with a rule.`,
      actions: [{ label: 'Add a rule', run: () => ctx.go(hashFor('rules', { column: draft.id })) }],
    });
  };
  requestAnimationFrame(() => name.focus());
  return drawer(
    'Add a column',
    closeHref,
    h('p', { class: 'drawer-text' }, 'A column is one thing your team wants to know about every UTM: its channel, campaign, region, agency or budget owner. ',
      "Fill it by typing values, by rules, or both. A UTM counts as fully classified only once this column has a value too, so expect the headline number to dip."),
    h('form', { class: 'form', onsubmit: add },
      field('Column name', name),
      error,
      h('div', { class: 'form-actions' }, button('Add column', { kind: 'primary', type: 'submit', icon: 'plus' }))),
  );
}
