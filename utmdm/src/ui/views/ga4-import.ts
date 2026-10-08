import { displayUtm, normalizeParts, utmKey } from '../../core/normalize';
import { apply, coverage, isComplete, resolve } from '../../core/table';
import { addUtms } from '../../core/workspace';
import { connectGoogle, forgetGoogle, googleToken } from '../../cloud/google';
import { GA4_RANGES, fetchGa4Rows, listGa4Properties, type Ga4Property, type Ga4Row } from '../../sources/ga4';
import { button, select } from '../components';
import type { Ctx } from '../ctx';
import { fill, h } from '../dom';
import { fmtInt, plural } from '../format';
import { icon } from '../icons';

/*
 * Import UTMs from Google Analytics 4: connect (a Google pop-up), pick a
 * property and a date range, preview what's new and what merges, then add.
 * Kept between renders so a save elsewhere doesn't lose the connection or preview.
 */
let properties: Ga4Property[] | null = null;
let propertyId = '';
let rangeId = '90';
let busy: '' | 'connecting' | 'loading' = '';
let problem = '';
let fetched: { property: Ga4Property; range: string; rows: Ga4Row[] } | null = null;

/** `beforeAdd` runs just before the import is saved, so a drawer can close first. */
export function ga4Import(ctx: Ctx, beforeAdd?: () => void): HTMLElement {
  const host = h('div', { class: 'ga4' });
  const rerender = () => fill(host, ...body());

  async function connect(): Promise<void> {
    busy = 'connecting';
    problem = '';
    rerender();
    try {
      const token = await connectGoogle(ctx.googleClientId!);
      properties = await listGa4Properties(token);
      propertyId = properties.find((p) => p.id === propertyId)?.id ?? properties[0]?.id ?? '';
      if (!properties.length) problem = 'That Google account can\'t read any GA4 properties. Try another account, or ask for Viewer access.';
    } catch (error) {
      problem = error instanceof Error ? error.message : 'Couldn\'t connect to Google Analytics.';
    }
    busy = '';
    rerender();
  }

  async function preview(): Promise<void> {
    const token = googleToken();
    const property = properties?.find((p) => p.id === propertyId);
    const range = GA4_RANGES.find((r) => r.id === rangeId)!;
    if (!token) {
      properties = null;
      problem = 'The Google connection expired. Connect again.';
      return rerender();
    }
    if (!property) return;
    busy = 'loading';
    problem = '';
    fetched = null;
    rerender();
    try {
      fetched = { property, range: range.label.toLowerCase(), rows: await fetchGa4Rows(property.id, token, { startDate: range.startDate, endDate: 'today' }) };
    } catch (error) {
      problem = error instanceof Error ? error.message : 'Couldn\'t read that property.';
    }
    busy = '';
    rerender();
  }

  function body(): (HTMLElement | null)[] {
    if (!ctx.googleClientId) {
      return [h('p', { class: 'muted' }, icon('lock', 13), ' Not switched on for this site yet: it needs a Google OAuth client (see the README).')];
    }
    const note = problem ? h('p', { class: 'form-error', role: 'alert' }, problem) : null;
    if (!properties || !googleToken()) {
      return [
        note,
        h('div', { class: 'soon-actions' },
          button(busy === 'connecting' ? 'Waiting for Google…' : 'Connect Google Analytics', {
            kind: 'primary', icon: 'chart', disabled: busy === 'connecting', onClick: () => void connect(),
          }),
          h('span', { class: 'muted' }, icon('lock', 13), ' Read-only. The Google token stays in this tab for about an hour and is never stored.')),
      ];
    }
    return [
      h('div', { class: 'soon-form' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'GA4 property'),
          select(properties.map((p) => [p.id, p.account ? `${p.name} (${p.account})` : p.name] as const), propertyId, {
            'aria-label': 'GA4 property',
            onchange: (e: Event) => {
              propertyId = (e.target as HTMLSelectElement).value;
              fetched = null;
              rerender();
            },
          })),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Date range'),
          select(GA4_RANGES.map((r) => [r.id, r.label] as const), rangeId, {
            'aria-label': 'Date range',
            onchange: (e: Event) => {
              rangeId = (e.target as HTMLSelectElement).value;
              fetched = null;
              rerender();
            },
          })),
        h('div', { class: 'soon-actions' },
          button(busy === 'loading' ? 'Reading GA4…' : 'Find UTMs', { kind: 'primary', icon: 'search', disabled: busy === 'loading', onClick: () => void preview() }),
          button('Disconnect', {
            kind: 'ghost',
            onClick: () => {
              forgetGoogle();
              properties = null;
              fetched = null;
              rerender();
            },
          }))),
      note,
      fetched ? result(fetched) : null,
    ];
  }

  function result(found: NonNullable<typeof fetched>): HTMLElement {
    const { table } = ctx;
    const draft = addUtms(table, found.rows, `Google Analytics 4 (${found.property.name}, ${found.range})`);
    const sessions = new Map<string, number>();
    for (const row of found.rows) {
      const key = utmKey(normalizeParts(row));
      sessions.set(key, (sessions.get(key) ?? 0) + row.sessions);
    }
    const distinct = sessions.size;
    const merged = draft.repeats;
    const next = apply(table, draft.op, () => undefined);
    const grid = resolve(next);
    const added = new Set(draft.added.map((u) => u.key));
    const newRows = next.utms.filter((u) => added.has(u.key));
    const cells = newRows.length * next.columns.length;
    const filled = coverage({ ...next, utms: newRows }, grid).byRule;
    const complete = newRows.filter((u) => isComplete(next, grid, u)).length;
    const top = [...draft.added].sort((a, b) => (sessions.get(b.key) ?? 0) - (sessions.get(a.key) ?? 0)).slice(0, 8);
    const message = draft.added.length && cells
      ? `Your rules filled ${fmtInt(filled)} of their ${fmtInt(cells)} cells${complete ? `, and ${fmtInt(complete)} arrived fully classified` : ''}.`
      : '';

    if (!found.rows.length) {
      return h('p', { class: 'paste-skipped' }, `No UTM-tagged sessions in ${found.property.name} for the ${found.range}. `,
        'Sessions without a campaign, like direct or organic visits, aren\'t UTMs and are left out.');
    }
    return h('div', { class: 'paste-preview' },
      h('p', { class: 'paste-count' }, icon('check', 14),
        `${plural(found.rows.length, 'row')} from GA4 became ${plural(distinct, 'UTM')}`,
        merged ? ` (${fmtInt(merged)} spelling${merged === 1 ? '' : 's'} merged)` : '',
        `: ${fmtInt(draft.added.length)} new, ${fmtInt(draft.known)} already in the table.`),
      message ? h('p', { class: 'paste-rules' }, icon('bolt', 14), message.replace('filled', 'will fill').replace('arrived', 'arrive')) : null,
      top.length
        ? h('ul', { class: 'paste-list ga4-list' }, ...top.map((u) => h('li', null, h('span', { class: 'utm' }, displayUtm(u.raw)),
          h('span', { class: 'muted' }, `${fmtInt(sessions.get(u.key) ?? 0)} sessions`))),
          draft.added.length > top.length ? h('li', { class: 'muted' }, `and ${fmtInt(draft.added.length - top.length)} more`) : null)
        : null,
      h('div', { class: 'form-actions' },
        button(draft.added.length ? `Add ${plural(draft.added.length, 'UTM')}` : 'Nothing new to add', {
          kind: 'primary',
          icon: 'plus',
          disabled: !draft.added.length,
          onClick: () => {
            const count = draft.added.length;
            fetched = null;
            beforeAdd?.();
            ctx.commit(draft, { message: `Added ${plural(count, 'UTM')} from Google Analytics 4. ${message}` });
          },
        })));
  }

  rerender();
  return host;
}
