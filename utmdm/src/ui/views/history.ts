import { utmTableCsv } from '../../core/csv';
import type { Coverage, Refresh, Version } from '../../core/model';
import { parseWorkspace } from '../../core/store';
import { describeRule, diffRules, restoreVersion } from '../../core/workspace';
import { button, pageHeader } from '../components';
import type { Ctx } from '../ctx';
import { h } from '../dom';
import { fmtDateTime, fmtInt, fmtPct, timeAgo } from '../format';
import { icon } from '../icons';
import { coverageChart } from './chart';
import { downloadText } from './download';

type Event = { kind: 'version'; at: string; item: Version } | { kind: 'refresh'; at: string; item: Refresh };

const classifiedShare = (c: Coverage) => (c.utms ? c.classified / c.utms : 0);

export function historyView(ctx: Ctx): HTMLElement {
  const { ws } = ctx;
  // Oldest first. When a refresh and a version share a moment (the demo's first day), the refresh came first.
  const events: Event[] = [
    ...ws.refreshes.map((item) => ({ kind: 'refresh' as const, at: item.at, item })),
    ...ws.versions.map((item) => ({ kind: 'version' as const, at: item.at, item })),
  ].sort((a, b) => a.at.localeCompare(b.at) || (a.kind === b.kind ? 0 : a.kind === 'refresh' ? -1 : 1));

  const current = ws.versions.at(-1)?.number;
  const items = events.map((event, i) => {
    const before = i ? events[i - 1]!.item.coverage : null;
    const after = event.item.coverage;
    const change = before
      ? `${fmtPct(before.classified, before.utms)} → ${fmtPct(after.classified, after.utms)} fully classified`
      : `${fmtPct(after.classified, after.utms)} fully classified`;
    return event.kind === 'version' ? versionItem(ctx, event.item, change, event.item.number === current)
      : refreshItem(event.item, change);
  });

  const restoreInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'sr-only',
    id: 'restore-file',
    onchange: async (e: globalThis.Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const restored = parseWorkspace(await file.text());
        if (window.confirm(`Replace this workspace with the backup (${fmtInt(restored.utms.length)} UTMs, ${restored.versions.length} versions)?`)) {
          ctx.commit(restored, 'Backup restored.');
        }
      } catch (error) {
        ctx.toast((error as Error).message);
      }
    },
  });

  return h(
    'div',
    { class: 'view view-history' },
    pageHeader('History', 'Every refresh and every rules change, newest first. Versions never change: restoring an old one saves a new version with its rules.'),
    h('section', { class: 'card' }, h('h2', null, 'Coverage over time'),
      coverageChart(events.map((e) => ({
        kind: e.kind,
        title: e.kind === 'version' ? `Version ${e.item.number}` : `Refresh: ${e.item.period}`,
        detail: e.kind === 'version' ? e.item.message : `${fmtInt(e.item.newUtms)} new UTMs, ${fmtInt(e.item.rows)} rows`,
        value: classifiedShare(e.item.coverage),
      })))),
    h('section', { class: 'card' }, h('h2', null, 'Timeline'), h('ol', { class: 'timeline' }, ...items.reverse())),
    h(
      'section',
      { class: 'card data-card' },
      h('h2', null, 'Your data'),
      h('p', { class: 'card-intro' }, 'This demo keeps everything in this browser. Export the table any time, and keep a backup: clearing the browser clears the workspace.'),
      h(
        'div',
        { class: 'data-actions' },
        button('Export UTM table (CSV)', {
          icon: 'download',
          onClick: () => downloadText(utmTableCsv(ws, ctx.results), `utmdm-utm-table-v${current ?? 0}-${ctx.now().slice(0, 10)}.csv`, 'text/csv'),
        }),
        button('Download backup', {
          icon: 'download',
          onClick: () => downloadText(JSON.stringify(ws, null, 2), `utmdm-backup-${ctx.now().slice(0, 10)}.json`, 'application/json'),
        }),
        h('label', { class: 'button button-secondary', for: 'restore-file' }, icon('upload'), 'Restore a backup'),
        restoreInput,
        button('Start the demo over', { kind: 'danger', icon: 'restore', onClick: () => ctx.reset() }),
      ),
    ),
  );
}

function versionItem(ctx: Ctx, version: Version, change: string, isCurrent: boolean): HTMLElement {
  const { ws } = ctx;
  const previous = ws.versions.find((v) => v.number === version.number - 1);
  const changes = diffRules(previous?.rules ?? [], version.rules);
  return h(
    'li',
    { class: 'event event-version' },
    h('span', { class: 'event-icon' }, icon('check', 16)),
    h(
      'div',
      { class: 'event-body' },
      h('p', { class: 'event-title' }, h('strong', null, `Version ${version.number}`), isCurrent ? h('span', { class: 'badge-current' }, 'Current') : null,
        ' ', version.message),
      h('p', { class: 'event-meta' }, `${version.author} · `, h('time', { datetime: version.at, title: fmtDateTime(version.at) }, timeAgo(version.at)),
        ` · ${change}`),
      changes.length
        ? h('details', { class: 'event-changes' }, h('summary', null, `What changed (${changes.length})`),
          h('ul', null, ...changes.map((c) => h('li', null, h('code', null, c.id), ' ',
            c.kind === 'added' ? `added: ${describeRule(c.after!, ws.fields)}`
              : c.kind === 'removed' ? `removed: ${describeRule(c.before!, ws.fields)}`
                : `${c.changed.join(', ')} changed: ${describeRule(c.after!, ws.fields)}${c.after!.active ? '' : ' (off)'}`))))
        : null,
      isCurrent ? null : button(`Restore version ${version.number}`, {
        kind: 'ghost',
        icon: 'restore',
        onClick: () => {
          const next = restoreVersion(ws, version.number, ctx.now());
          ctx.commit(next, next === ws ? 'Those are already the current rules.' : `Version ${next.versions.at(-1)!.number}: the rules of version ${version.number} are back.`);
        },
      }),
    ),
  );
}

function refreshItem(refresh: Refresh, change: string): HTMLElement {
  return h(
    'li',
    { class: 'event event-refresh' },
    h('span', { class: 'event-icon' }, icon('refresh', 16)),
    h('div', { class: 'event-body' },
      h('p', { class: 'event-title' }, h('strong', null, `Refreshed: ${refresh.period}`), ` from ${refresh.source}`),
      h('p', { class: 'event-meta' }, h('time', { datetime: refresh.at, title: fmtDateTime(refresh.at) }, timeAgo(refresh.at)),
        ` · ${fmtInt(refresh.rows)} rows, ${fmtInt(refresh.newUtms)} new UTMs, ${fmtInt(refresh.updatedUtms)} updated · ${change}`)),
  );
}
