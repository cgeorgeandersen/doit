import { tableCsv } from '../../core/csv';
import { createDemoWorkspace } from '../../core/demo';
import { parseWorkspace } from '../../core/store';
import { WAREHOUSE_TABLE, warehouseDdl } from '../../core/warehouse';
import { GA4_DIMENSIONS, GA4_METRICS } from '../../sources/ga4';
import { button, linkButton, pageHeader, select } from '../components';
import type { Ctx } from '../ctx';
import { h, type Child } from '../dom';
import { fmtInt, plural } from '../format';
import { icon, type IconName } from '../icons';
import { hashFor } from '../routes';
import { downloadText } from './download';

const GA4_RANGES = [['28', 'Last 28 days'], ['90', 'Last 90 days'], ['365', 'Last 12 months']] as const;

const PART_FOR: Record<(typeof GA4_DIMENSIONS)[number], string> = {
  sessionSource: 'utm_source',
  sessionMedium: 'utm_medium',
  sessionCampaignName: 'utm_campaign',
  sessionManualAdContent: 'utm_content',
  sessionManualTerm: 'utm_term',
};

const DESTINATIONS: { name: string; how: string }[] = [
  { name: 'Snowflake', how: 'A table in your database and schema, with key-pair sign-in.' },
  { name: 'Databricks', how: 'A Delta table in Unity Catalog, written through a SQL warehouse.' },
  { name: 'Google BigQuery', how: 'A table in your project, next to your GA4 export dataset.' },
  { name: 'Amazon Redshift', how: 'A table loaded through the Redshift Data API or from S3.' },
  { name: 'PostgreSQL', how: 'Any Postgres database, including Neon, Supabase and RDS.' },
  { name: 'Microsoft SQL Server', how: 'SQL Server, Azure SQL, or a Fabric warehouse.' },
];

/** Where UTMs come in from, and where the classified table goes out to. */
export function dataView(ctx: Ctx): HTMLElement {
  const { table, ws } = ctx;
  const version = ctx.version;
  const spellings = table.utms.reduce((n, u) => n + u.spellings.length, 0);
  const merged = spellings - table.utms.length;

  const restoreInput = h('input', {
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
    { class: 'view view-data' },
    pageHeader('Import & export',
      'Bring UTMs in from wherever your team tags links today, and send the classified table to wherever your reports are built. ' +
      'Pasting and files work now; the live connections are next.'),

    h('section', { class: 'data-section', 'aria-labelledby': 'import-title' },
      h('div', { class: 'section-title' }, h('h2', { id: 'import-title' }, icon('upload', 18), 'Import'),
        h('p', null, 'Every import adds UTMs and never removes them. Spellings that differ only in capitals, spaces or URL encoding merge into one row.')),
      h('div', { class: 'data-grid' },
        card('upload', 'Paste or upload', 'ready',
          [h('p', null, 'Tagged links, rows copied from a spreadsheet, or a CSV file. UTMs already in the table are merged, not duplicated, and your rules classify the new ones as they arrive.')],
          h('div', { class: 'data-actions' },
            linkButton('Add UTMs', hashFor('table', { add: '1' }), { icon: 'plus', kind: 'primary' }),
            linkButton('How to format a CSV', hashFor('table', { add: '1' }), { kind: 'ghost' }))),

        card('chart', 'UTMs from Google Analytics 4', 'soon',
          [
            h('p', null, 'Connect a GA4 property and pull every UTM that brought traffic in a date range. A Refresh button keeps the table current, so new campaigns show up without anyone pasting them in.'),
            h('div', { class: 'dedupe' },
              h('p', { class: 'dedupe-title' }, 'How deduplication works'),
              h('ul', { class: 'dedupe-list' },
                h('li', null, example(['FB / Paid_Social / SUMMER%20CUP', 'fb / paid_social / summer cup']), h('span', null, 'one row: only capitals and encoding differ')),
                h('li', null, example(['meta / paid-social / summer-cup', 'meta / paid-social / summer_cup']), h('span', null, 'two rows: whether "-" and "_" mean the same thing is for a rule to decide'))),
              h('p', { class: 'dedupe-stat' }, icon('check', 14),
                merged
                  ? `In this workspace, ${plural(spellings, 'spelling')} became ${plural(table.utms.length, 'row')}: ${fmtInt(merged)} duplicate${merged === 1 ? '' : 's'} merged.`
                  : `In this workspace, all ${plural(spellings, 'spelling')} are different UTMs.`)),
          ],
          disabledForm([
            ['GA4 property ID', h('input', { disabled: true, placeholder: '123456789', 'aria-label': 'GA4 property ID' })],
            ['Date range', select(GA4_RANGES, '90', { disabled: true, 'aria-label': 'Date range' })],
          ], 'Connect Google Analytics')),

        card('chart', 'Sessions from Google Analytics 4', 'soon',
          [
            h('p', null, 'Bring in sessions and key events for every UTM in the table, for the date range you choose.'),
            h('ul', { class: 'benefits' },
              h('li', null, 'Sessions become a read-only column beside your classifications.'),
              h('li', null, 'The busiest UTMs sort to the top of "Needs values", so the decisions that move the most traffic come first.'),
              h('li', null, 'Coverage is reported by traffic as well as by count: "82% of sessions are fully classified".')),
          ],
          disabledForm([
            ['Date range', select(GA4_RANGES, '28', { disabled: true, 'aria-label': 'Sessions date range' })],
          ], 'Import sessions')),
      ),
      h('details', { class: 'card under-hood' },
        h('summary', null, 'Under the hood: how GA4 maps to UTMs'),
        h('p', null, 'UTMDM asks the GA4 Data API (runReport) for these session-scoped dimensions and metrics. Sessions without a UTM campaign, like ',
          h('code', null, '(direct)'), ' and ', h('code', null, '(organic)'), ', are skipped, and ', h('code', null, '(not set)'), ' is read as empty.'),
        h('table', { class: 'mapping' },
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'GA4'), h('th', { scope: 'col' }, 'UTMDM'))),
          h('tbody', null,
            ...GA4_DIMENSIONS.map((d) => h('tr', null, h('td', null, h('code', null, d)), h('td', null, h('code', null, PART_FOR[d])))),
            ...GA4_METRICS.map((m) => h('tr', null, h('td', null, h('code', null, m)), h('td', null, m === 'sessions' ? 'Sessions column' : 'Key events column'))))),
        h('p', null, 'Rows are deduplicated on the normalized ', h('code', null, 'source | medium | campaign | content | term'),
          ', and sessions from every spelling of a UTM add up on its one row.'))),

    h('section', { class: 'data-section', 'aria-labelledby': 'export-title' },
      h('div', { class: 'section-title' }, h('h2', { id: 'export-title' }, icon('download', 18), 'Export'),
        h('p', null, 'Send the classified table where your reports are built, so every dashboard joins to the same values.')),
      h('div', { class: 'data-grid' },
        card('download', 'Download', 'ready',
          [h('p', null, `The table as it is now (version ${fmtInt(version)}) opens in Excel or Google Sheets, and loads into any warehouse with its file loader. `,
            'A backup holds every version, so it can be restored here later.')],
          h('div', { class: 'data-actions' },
            button('Table as CSV', {
              icon: 'download',
              kind: 'primary',
              onClick: () => downloadText(tableCsv(table, ctx.grid, version), `utmdm-table-v${version}.csv`, 'text/csv'),
            }),
            button('Backup (JSON)', {
              icon: 'download',
              onClick: () => downloadText(JSON.stringify(ws), `utmdm-backup-v${version}-${ctx.now().slice(0, 10)}.json`, 'application/json'),
            }),
            h('label', { class: 'button button-secondary', for: 'restore-file' }, icon('upload'), 'Restore a backup', restoreInput),
            button('Start the demo over', {
              kind: 'danger',
              icon: 'restore',
              onClick: () => {
                if (!window.confirm('Start the demo over? Everything you changed in this browser goes.')) return;
                ctx.replace({ ...createDemoWorkspace(ctx.now()), user: ws.user }, 'The demo is back to where it started.');
              },
            }))),

        card('database', 'Warehouses and databases', 'soon',
          [
            h('p', null, 'Connect a destination once, and UTMDM writes the classified table to it on every new version: one row per UTM, one column per classification, stamped with its version.'),
            h('ul', { class: 'destinations' },
              ...DESTINATIONS.map((d) => h('li', { class: 'destination' },
                h('span', { class: 'destination-name' }, icon('database', 16), d.name),
                h('span', { class: 'destination-how' }, d.how),
                button('Connect', { disabled: true, title: 'Coming next' })))),
            h('p', { class: 'card-intro' }, 'Something else, like Oracle, MySQL or a dbt project? Ask, and it goes on the list. Until then, the CSV loads anywhere.'),
          ]),
      ),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', null, `What gets written: ${WAREHOUSE_TABLE}`),
          button('Copy SQL', {
            icon: 'copy',
            kind: 'ghost',
            onClick: () => {
              navigator.clipboard?.writeText(warehouseDdl(table)).then(() => ctx.toast('Copied the table definition.'), () => ctx.toast("Couldn't copy here. Select the text instead."));
            },
          })),
        h('p', { class: 'card-intro' }, 'Built from your columns as they are now, so adding a column here adds one there. Each destination upserts on ',
          h('code', null, 'utm_key'), '. The rules and the version history can go alongside, as ', h('code', null, 'utmdm.rules'), ' and ', h('code', null, 'utmdm.changes'), '.'),
        h('pre', { class: 'code', tabindex: 0, 'aria-label': 'SQL table definition' }, h('code', null, warehouseDdl(table)))),
    ),
  );
}

function card(iconName: IconName, title: string, state: 'ready' | 'soon', body: Child[], ...actions: Child[]): HTMLElement {
  return h('section', { class: `card data-card${state === 'soon' ? ' is-soon' : ''}` },
    h('div', { class: 'data-card-head' },
      h('h3', null, icon(iconName, 18), title),
      h('span', { class: `badge badge-${state}` }, state === 'ready' ? 'Works now' : 'Coming next')),
    ...body,
    ...actions);
}

function example(lines: string[]): HTMLElement {
  return h('span', { class: 'example' }, ...lines.map((l) => h('code', null, l)));
}

function disabledForm(fields: [string, HTMLElement][], action: string): HTMLElement {
  return h('div', { class: 'soon-form' },
    ...fields.map(([label, control]) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control)),
    h('div', { class: 'soon-actions' },
      button(action, { disabled: true, title: 'Arrives with sign-in' }),
      h('span', { class: 'muted' }, icon('lock', 13), ' Arrives with sign-in')));
}
