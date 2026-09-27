/**
 * Footnotes. Any element with data-cite="key [key…]" becomes a superscript
 * link to a numbered source list at the end of its chapter. Keys refer to
 * src/content/sources.ts, or to timely.json entries as "timely:<id>".
 *
 * Numbers are assigned per chapter, in reading order. Sources used only by
 * interactive content (quiz answers, card reveals) are declared on the
 * chapter with data-sources="…" so the list is complete before any reveal.
 */
import { SOURCES } from '../content/sources';
import { h, qsa } from './dom';
import { fmtDate } from './format';
import { timely } from './timely';

export interface ResolvedSource {
  key: string;
  by?: string;
  title: string;
  publisher?: string;
  date: string;
  url?: string;
  note?: string;
  lastChecked?: string;
}

export function resolveSource(key: string): ResolvedSource | null {
  if (key.startsWith('timely:')) {
    const entry = timely(key.slice('timely:'.length));
    return {
      key,
      title: entry.sourceName,
      date: `as of ${fmtDate(entry.asOf)}`,
      url: entry.sourceUrl,
      note: entry.note,
      lastChecked: entry.lastChecked,
    };
  }
  const source = SOURCES[key];
  return source ? { key, ...source } : null;
}

interface Registry {
  chapter: HTMLElement;
  numbers: Map<string, number>;
  list: HTMLOListElement;
  summaryCount: HTMLElement | null;
}

const registries = new Map<HTMLElement, Registry>();

function closestFrom(target: EventTarget | null, selector: string): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(selector) : null;
}

function register(reg: Registry, key: string): number | null {
  const existing = reg.numbers.get(key);
  if (existing) return existing;
  const source = resolveSource(key);
  if (!source) {
    console.warn(`Unknown source key: ${key}`);
    return null;
  }
  const n = reg.numbers.size + 1;
  reg.numbers.set(key, n);
  reg.list.append(renderSource(reg, source, n));
  if (reg.summaryCount) reg.summaryCount.textContent = String(reg.numbers.size);
  return n;
}

function sourceId(reg: Registry, n: number): string {
  return `src-${reg.chapter.id}-${n}`;
}

function renderSource(reg: Registry, source: ResolvedSource, n: number): HTMLLIElement {
  const titleNode = source.url
    ? h('a', { href: source.url, rel: 'noopener', target: '_blank' }, source.title)
    : h('span', {}, source.title);
  return h(
    'li',
    { id: sourceId(reg, n), 'data-key': source.key },
    source.by ? `${source.by}. ` : '',
    titleNode,
    '. ',
    source.publisher ? `${source.publisher}, ` : '',
    source.date,
    '.',
    source.lastChecked ? h('span', { class: 'source-checked' }, ` Last checked ${fmtDate(source.lastChecked)}.`) : '',
    source.note ? h('span', { class: 'source-note' }, ` ${source.note}`) : '',
  );
}

function registryFor(el: Element): Registry | null {
  const chapter = el.closest<HTMLElement>('[data-chapter]');
  return chapter ? (registries.get(chapter) ?? null) : null;
}

/** Turn unprocessed [data-cite] markers inside `root` into numbered links. */
export function renderCitations(root: ParentNode): void {
  qsa<HTMLElement>('[data-cite]', root).forEach((marker) => {
    if (marker.dataset.citeDone) return;
    const reg = registryFor(marker);
    if (!reg) return;
    const keys = marker.dataset.cite!.split(/\s+/).filter(Boolean);
    const sup = h('sup', { class: 'cite' });
    keys.forEach((key) => {
      const n = register(reg, key);
      if (n === null) return;
      if (sup.childElementCount) sup.append(h('span', { class: 'cite-sep', 'aria-hidden': 'true' }, ','));
      sup.append(
        h(
          'a',
          {
            href: `#${sourceId(reg, n)}`,
            class: 'cite-link',
            'data-key': key,
            'aria-label': `Source ${n}: ${resolveSource(key)?.title ?? ''}`,
          },
          String(n),
        ),
      );
    });
    marker.replaceChildren(sup);
    marker.dataset.citeDone = 'true';
  });
}

/** A citation marker for content built in script. */
export function cite(...keys: string[]): HTMLElement {
  return h('span', { 'data-cite': keys.join(' ') });
}

export function initCitations(): void {
  qsa<HTMLElement>('[data-chapter]').forEach((chapter) => {
    const holder = chapter.querySelector<HTMLElement>('[data-sources-list]');
    if (!holder) return;
    const list = h('ol', { class: 'sources-list' });
    const count = h('span', { class: 'sources-count' }, '0');
    const details = h(
      'details',
      { class: 'sources' },
      h('summary', {}, h('span', {}, 'Sources and notes for this chapter'), h('span', { class: 'sources-count-wrap' }, '(', count, ')')),
      list,
    );
    holder.replaceChildren(details);
    const reg: Registry = { chapter, numbers: new Map(), list, summaryCount: count };
    registries.set(chapter, reg);
    renderCitations(chapter);
    (chapter.dataset.sources ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .forEach((key) => register(reg, key));
  });

  // Following a citation opens the collapsed list it points into.
  document.addEventListener('click', (event) => {
    const link = closestFrom(event.target, 'a.cite-link');
    if (!link) return;
    const target = document.getElementById(link.getAttribute('href')!.slice(1));
    const details = target?.closest('details');
    if (details && !details.open) details.open = true;
  });

  setupPopover();
}

function setupPopover(): void {
  const pop = h('div', { class: 'cite-pop', role: 'tooltip', hidden: true });
  document.body.append(pop);
  let current: HTMLElement | null = null;

  const show = (link: HTMLElement) => {
    const source = resolveSource(link.dataset.key ?? '');
    if (!source) return;
    current = link;
    pop.replaceChildren(
      h('span', { class: 'cite-pop-title' }, source.title),
      h('span', { class: 'cite-pop-meta' }, [source.by, source.publisher, source.date].filter(Boolean).join(' · ')),
    );
    pop.hidden = false;
    const r = link.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 32);
    pop.style.width = `${width}px`;
    const left = Math.min(Math.max(16, r.left + r.width / 2 - width / 2), window.innerWidth - width - 16);
    pop.style.left = `${left + window.scrollX}px`;
    pop.style.top = `${r.bottom + window.scrollY + 8}px`;
  };
  const hide = () => {
    pop.hidden = true;
    current = null;
  };

  document.addEventListener('pointerover', (e) => {
    const link = closestFrom(e.target, 'a.cite-link');
    if (link && link !== current && e.pointerType === 'mouse') show(link);
  });
  document.addEventListener('pointerout', (e) => {
    if (closestFrom(e.target, 'a.cite-link')) hide();
  });
  document.addEventListener('focusin', (e) => {
    const link = closestFrom(e.target, 'a.cite-link');
    if (link) show(link);
    else if (current) hide();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) hide();
  });
  window.addEventListener('scroll', () => current && hide(), { passive: true });
}
