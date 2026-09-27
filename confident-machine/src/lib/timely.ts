/**
 * Typed access to src/content/timely.json, the single home of every
 * time-sensitive claim, plus the small "last checked" stamps shown beside them.
 */
import raw from '../content/timely.json';
import { h } from './dom';
import { daysBetween, fmtDate } from './format';

export interface TimelyEntry {
  id: string;
  section: string;
  claim: string;
  sourceName: string;
  sourceUrl: string;
  asOf: string;
  lastChecked: string;
  note?: string;
  contested?: boolean;
  data?: unknown;
}

export interface HalfLifeClaim {
  id: string;
  claim: string;
  statedOn: string;
  statedBy: string;
  statedUrl: string;
  status: 'overtaken' | 'revised' | 'standing';
  overtakenOn?: string;
  update: string;
  updateBy: string;
  updateUrl: string;
  lastChecked: string;
}

export const TIMELY_META = raw.meta;
export const TIMELY_ENTRIES = raw.entries as TimelyEntry[];
export const HALF_LIFE = raw.halfLife.claims as HalfLifeClaim[];
export const HALF_LIFE_NOTE = raw.halfLife.description;

const byId = new Map(TIMELY_ENTRIES.map((e) => [e.id, e]));

export function timely(id: string): TimelyEntry {
  const entry = byId.get(id);
  if (!entry) throw new Error(`Unknown timely entry: ${id}`);
  return entry;
}

export function timelyData<T>(id: string): T {
  return timely(id).data as T;
}

/** The build date, injected by Vite; "today" for freshness checks. */
export function buildDate(): Date {
  return new Date(__BUILD_DATE__);
}

export function isStale(lastChecked: string, now: Date = buildDate()): boolean {
  return daysBetween(lastChecked, now) > TIMELY_META.staleAfterDays;
}

/** "Checked Sep 27, 2026", flagged when older than the freshness window. */
export function stamp(lastChecked: string, extraClass = ''): HTMLElement {
  const stale = isStale(lastChecked);
  return h(
    'span',
    {
      class: `stamp ${stale ? 'stamp--stale' : ''} ${extraClass}`.trim(),
      title: stale
        ? `Last verified ${fmtDate(lastChecked)}. AI facts change quickly; this one may be out of date.`
        : `Last verified against its source on ${fmtDate(lastChecked)}.`,
    },
    h('span', { class: 'stamp-dot', 'aria-hidden': 'true' }),
    stale ? `Checked ${fmtDate(lastChecked)} · may be out of date` : `Checked ${fmtDate(lastChecked)}`,
  );
}

/**
 * Fill every [data-timely="id"] element with its claim, a citation marker and
 * a freshness stamp. Use data-timely-mode="stamp" to keep hand-written text
 * and only add the stamp and citation.
 */
export function hydrateTimely(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-timely]').forEach((el) => {
    if (el.dataset.timelyDone) return;
    const entry = timely(el.dataset.timely!);
    const mode = el.dataset.timelyMode ?? 'claim';
    if (mode === 'claim') el.textContent = entry.claim;
    el.append(h('span', { 'data-cite': `timely:${entry.id}` }), ' ', stamp(entry.lastChecked));
    if (entry.contested) el.append(' ', h('span', { class: 'tag tag--contested' }, 'Contested'));
    el.dataset.timelyDone = 'true';
  });
}
