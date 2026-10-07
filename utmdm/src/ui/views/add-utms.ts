import { displayUtm } from '../../core/normalize';
import { parseUtms } from '../../core/paste';
import { apply, coverage, isComplete, resolve } from '../../core/table';
import { addUtms } from '../../core/workspace';
import { button, drawer } from '../components';
import type { Ctx } from '../ctx';
import { fill, h } from '../dom';
import { fmtInt, plural } from '../format';
import { icon } from '../icons';

// Kept between renders, so the text survives a re-render.
let pasted = '';

const EXAMPLE = [
  'https://zestify.example/cup?utm_source=facebook&utm_medium=paid_social&utm_campaign=summer_cup_finals&utm_content=video_15s',
  'https://zestify.example/cup?utm_source=Instagram&utm_medium=Paid_Social&utm_campaign=Summer%20Cup%20Finals&utm_content=story',
  'https://zestify.example/?utm_source=google&utm_medium=cpc&utm_campaign=summer_cup_finals&utm_term=zestify+soda',
  'source,medium,campaign,content',
  'newsletter,email,back_to_school,hero_banner',
  'snapchat,paid_social,back_to_school,lens',
].join('\n');

/** Paste links or spreadsheet rows; see what's new and what the rules will fill before adding. */
export function addUtmsDrawer(ctx: Ctx, closeHref: string): HTMLElement {
  const { table } = ctx;
  const area = h('textarea', {
    id: 'paste',
    rows: 9,
    spellcheck: 'false',
    'data-autofocus': true,
    placeholder: 'https://zestify.example/?utm_source=facebook&utm_medium=paid_social&utm_campaign=summer_cup\nsource, medium, campaign, content, term',
    'aria-describedby': 'paste-help',
  });
  area.value = pasted;
  const preview = h('div', { class: 'paste-preview', 'aria-live': 'polite' });
  const addButton = button('Add UTMs', { kind: 'primary', icon: 'plus', disabled: true });

  let draft: ReturnType<typeof addUtms> | null = null;
  let message = '';
  const update = () => {
    pasted = area.value;
    const parsed = parseUtms(area.value);
    draft = parsed.rows.length ? addUtms(table, parsed.rows) : null;
    if (!draft) {
      addButton.disabled = true;
      addButton.lastChild!.textContent = 'Add UTMs';
      fill(preview, parsed.skipped.length ? skippedNote(parsed.skipped) : null);
      return;
    }
    const next = apply(table, draft.op, () => undefined);
    const grid = resolve(next);
    const added = new Set(draft.added.map((u) => u.key));
    const newRows = next.utms.filter((u) => added.has(u.key));
    const cells = newRows.length * next.columns.length;
    const filled = coverage({ ...next, utms: newRows }, grid).byRule;
    const complete = newRows.filter((u) => isComplete(next, grid, u)).length;
    addButton.disabled = !draft.added.length;
    addButton.lastChild!.textContent = draft.added.length ? `Add ${plural(draft.added.length, 'UTM')}` : 'Nothing new to add';
    message = draft.added.length && cells
      ? `Your rules filled ${fmtInt(filled)} of their ${fmtInt(cells)} cells${complete ? `, and ${fmtInt(complete)} arrived fully classified` : ''}.`
      : '';
    fill(
      preview,
      h('p', { class: 'paste-count' }, icon('check', 14),
        `${plural(parsed.rows.length, 'UTM')} found: ${fmtInt(draft.added.length)} new`,
        draft.known ? `, ${fmtInt(draft.known)} already in the table (merged, not duplicated)` : '', '.'),
      message ? h('p', { class: 'paste-rules' }, icon('bolt', 14), message.replace('Your rules filled', 'Your rules will fill').replace('arrived', 'arrive')) : null,
      draft.added.length
        ? h('ul', { class: 'paste-list' }, ...draft.added.slice(0, 8).map((u) => h('li', { class: 'utm' }, displayUtm(u.raw))),
          draft.added.length > 8 ? h('li', { class: 'muted' }, `and ${fmtInt(draft.added.length - 8)} more`) : null)
        : null,
      parsed.skipped.length ? skippedNote(parsed.skipped) : null,
    );
  };
  area.addEventListener('input', update);

  addButton.addEventListener('click', () => {
    if (!draft?.added.length) return;
    const count = draft.added.length;
    pasted = '';
    ctx.go(closeHref);
    ctx.commit(draft, { message: `Added ${plural(count, 'UTM')}. ${message}` });
  });

  const file = h('input', {
    type: 'file',
    id: 'paste-file',
    accept: '.csv,.tsv,.txt,text/csv,text/plain',
    class: 'sr-only',
    onchange: async (event: Event) => {
      const chosen = (event.target as HTMLInputElement).files?.[0];
      if (!chosen) return;
      area.value = await chosen.text();
      update();
    },
  });

  update();
  return drawer(
    'Add UTMs',
    closeHref,
    h('p', { class: 'drawer-text', id: 'paste-help' },
      'Paste tagged links, or rows copied from a spreadsheet (source, medium, campaign, content, term, with or without a header). ',
      'UTMs already in the table are merged, never duplicated, and your rules classify the new ones as they arrive.'),
    area,
    h('div', { class: 'paste-tools' },
      h('label', { class: 'button button-ghost', for: 'paste-file' }, icon('upload'), 'Upload a CSV', file),
      button('Fill in an example', {
        kind: 'ghost',
        onClick: () => {
          area.value = EXAMPLE;
          update();
          area.focus();
        },
      })),
    preview,
    h('div', { class: 'form-actions' }, addButton),
    h('section', { class: 'soon' },
      h('p', { class: 'soon-title' }, icon('chart', 16), 'Google Analytics 4', h('span', { class: 'badge' }, 'Coming next')),
      h('p', null, 'Connect a GA4 property and a Refresh button pulls every UTM that brought traffic, with its sessions, straight into this table.'),
      button('Connect GA4', { disabled: true, title: 'Arrives with sign-in' })),
  );
}

function skippedNote(lines: string[]): HTMLElement {
  return h('p', { class: 'paste-skipped' }, `${plural(lines.length, 'line')} had no UTM in ${lines.length === 1 ? 'it' : 'them'}: `,
    h('span', { class: 'utm' }, lines.slice(0, 3).join(' · ')), lines.length > 3 ? '…' : '');
}
