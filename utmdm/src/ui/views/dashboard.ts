import { coverage, fieldCoverage, outstanding } from '../../core/classify';
import { nextSampleMonth } from '../../core/demo';
import { SAMPLE_SOURCE } from '../../sources/sample';
import { button, emptyState, linkButton, meter, pageHeader, statTile, statusChip, utmText } from '../components';
import type { Ctx } from '../ctx';
import { h } from '../dom';
import { fmtCompact, fmtInt, fmtPct, fmtPeriod, timeAgo } from '../format';
import { icon } from '../icons';
import { hashFor } from '../routes';
import { latestNewKeys } from '../../core/workspace';

export function dashboardView(ctx: Ctx): HTMLElement {
  const { ws, results } = ctx;
  const cov = coverage(ws.utms, results);
  const open = outstanding(ws.utms, results);
  const last = ws.refreshes.at(-1);
  const newKeys = latestNewKeys(ws);
  const newOpen = open.filter((utm) => newKeys.has(utm.key)).length;
  const version = ws.versions.at(-1);
  const activeRules = ws.rules.filter((rule) => rule.active).length;
  const next = nextSampleMonth(ws);
  const first = ws.utms.reduce((min, u) => (u.firstSeen < min ? u.firstSeen : min), ws.utms[0]?.firstSeen ?? '');
  const latest = ws.utms.reduce((max, u) => (u.lastSeen > max ? u.lastSeen : max), '');

  const refreshButton = button(ctx.refreshing ? `Pulling ${next?.label ?? ''}…` : next ? 'Refresh from GA4' : "You're up to date", {
    icon: 'refresh',
    kind: 'primary',
    busy: ctx.refreshing,
    disabled: ctx.refreshing || !next,
    onClick: () => void ctx.refresh(),
  });

  return h(
    'div',
    { class: 'view view-dashboard' },
    pageHeader(
      'Your UTM table',
      [
        `${fmtInt(cov.utms)} UTMs from ${first ? `${fmtPeriod(first)} to ${fmtPeriod(latest)}` : 'no data yet'}. `,
        last ? `Last refreshed ${timeAgo(last.at)}.` : 'Not refreshed yet.',
      ],
      refreshButton,
    ),

    h(
      'section',
      { class: 'hero card', 'aria-label': 'How much is classified' },
      h(
        'div',
        { class: 'hero-main' },
        h('p', { class: 'eyebrow' }, 'Fully classified'),
        h('p', { class: 'hero-figure' }, fmtPct(cov.classified, cov.utms)),
        h('p', { class: 'hero-text' }, `${fmtInt(cov.classified)} of ${fmtInt(cov.utms)} UTMs have a value for every classification.`),
        meter(cov.classified, cov.utms, 'UTMs fully classified', 'big'),
        h(
          'p',
          { class: 'hero-legend' },
          statusChip('classified', `${fmtInt(cov.classified)} classified`),
          statusChip('outstanding', `${fmtInt(open.length - cov.conflicts)} outstanding`),
          statusChip('conflict', `${fmtInt(cov.conflicts)} ${cov.conflicts === 1 ? 'conflict' : 'conflicts'}`),
        ),
      ),
      h(
        'div',
        { class: 'hero-side' },
        statTile('Sessions classified', fmtPct(cov.classifiedSessions, cov.sessions),
          `${fmtCompact(cov.classifiedSessions)} of ${fmtCompact(cov.sessions)} sessions`),
        statTile('Outstanding', fmtInt(open.length - cov.conflicts),
          ws.refreshes.length > 1 ? `${fmtInt(newOpen)} arrived in the last refresh` : 'no value yet for at least one classification',
          'outstanding'),
        statTile('Conflicts', fmtInt(cov.conflicts), 'rules that tie and disagree', 'conflict'),
        statTile('Active rules', fmtInt(activeRules), version ? `rules version ${version.number}` : 'no rules yet'),
      ),
    ),

    h(
      'div',
      { class: 'grid-2' },
      h(
        'section',
        { class: 'card' },
        h('h2', null, 'By classification'),
        h('p', { class: 'card-intro' }, 'Every UTM gets a value for each. Values come from a controlled list, so they never drift.'),
        h(
          'ul',
          { class: 'field-list' },
          ...fieldCoverage(ws.fields, ws.utms, results).map((fc) =>
            h(
              'li',
              { class: 'field-row' },
              h('div', { class: 'field-row-head' }, h('span', { class: 'field-row-name' }, fc.field.name),
                h('span', { class: 'field-row-pct' }, fmtPct(fc.classified, ws.utms.length))),
              meter(fc.classified, ws.utms.length, `${fc.field.name} classified`),
              h(
                'p',
                { class: 'field-row-meta' },
                fc.outstanding + fc.conflicts
                  ? h('a', { href: hashFor('utms', { field: fc.field.id }) },
                    `${fmtInt(fc.outstanding + fc.conflicts)} still need a ${fc.field.name.toLowerCase()}`)
                  : 'Every UTM has one',
                ` · ${fmtPct(fc.classifiedSessions, fc.sessions)} of sessions`,
              ),
            ),
          ),
        ),
      ),
      h(
        'section',
        { class: 'card refresh-card' },
        h('h2', null, 'Refresh'),
        h('p', { class: 'card-intro' },
          next
            ? `Next up: ${next.label} from ${SAMPLE_SOURCE}. New UTMs join the table, known ones gain traffic, and nothing is ever removed.`
            : `Every month of ${SAMPLE_SOURCE} is in the table.`),
        h('ul', { class: 'refresh-list' },
          ...ws.refreshes.slice(-3).reverse().map((r) =>
            h('li', null, h('span', { class: 'refresh-period' }, r.period),
              h('span', { class: 'muted' }, ` · ${fmtInt(r.newUtms)} new UTMs · ${timeAgo(r.at)}`)))),
        h('p', { class: 'note' }, icon('lock', 14),
          'Your own GA4 property connects here once sign-in exists. The same button then pulls new UTMs from the GA4 Data API.'),
      ),
    ),

    h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'To do, most traffic first'),
        open.length ? linkButton(`See all ${fmtInt(open.length - cov.conflicts)} outstanding`, hashFor('utms', { status: 'outstanding' }), { icon: 'arrow', kind: 'ghost' }) : null),
      open.length
        ? h(
          'ol',
          { class: 'queue' },
          ...open.slice(0, 8).map((utm) => {
            const classification = results.get(utm.key) ?? {};
            const missing = ws.fields.filter((f) => classification[f.id]?.status !== 'classified');
            return h(
              'li',
              { class: 'queue-item' },
              h('a', { class: 'queue-link', href: hashFor('utms', { status: 'outstanding', utm: utm.key }) },
                utmText(utm.raw),
                h('span', { class: 'queue-meta' },
                  ...missing.map((f) => statusChip(classification[f.id]?.status === 'conflict' ? 'conflict' : 'outstanding', f.name)),
                  newKeys.has(utm.key) ? h('span', { class: 'badge-new' }, 'New') : null),
                h('span', { class: 'queue-sessions' }, `${fmtInt(utm.sessions)} sessions`),
                h('span', { class: 'queue-go' }, 'Classify', icon('arrow', 14))),
            );
          }),
        )
        : emptyState('Nothing outstanding', 'Every UTM has a value for every classification. The next refresh may bring new ones.'),
    ),
  );
}
