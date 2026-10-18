/**
 * An address box that suggests places as you type, like a map app's search.
 *
 * - Cities and towns appear at once, from the Census list in src/lib/places.ts.
 * - Addresses, streets and named places come from Photon, which can take a
 *   few seconds to answer. So requests go out while you type, not only when
 *   you stop; none is cancelled; and the newest answer to arrive is shown.
 *   The list fills in and sharpens as you go, with a "Searching…" row while
 *   an answer is on its way.
 * - Clicking into an empty box offers "Use my current location".
 *
 * Keys follow the WAI-ARIA combobox pattern: arrows move through the list,
 * Enter picks the highlighted suggestion (or the first one), Escape closes.
 */

import { searchPlaces, type Place } from '../lib/geocode';
import type { LngLat } from '../lib/geo';
import { foldText, highlightRanges } from '../lib/normalize';
import { localPlaces } from '../lib/places';
import { h, prefersReducedMotion, type Child } from './dom';

type Item = { type: 'locate' } | { type: 'place'; place: Place };

/** Ask the geocoder this long after the last keystroke… */
const DEBOUNCE_MS = 150;
/** …and, while someone keeps typing, at least this often. */
const MAX_WAIT_MS = 400;
/** Never more than this many requests in flight from one box. */
const MAX_IN_FLIGHT = 3;
const MAX_ITEMS = 7;
const MAX_CITIES = 4;

const ICONS: Record<string, string[]> = {
  area: ['M3 21h18', 'M5 21V10l5-3v14', 'M10 21V4l9 4v13', 'M13 11h3', 'M13 15h3', 'M7 13h1', 'M7 17h1'],
  street: ['M5 20 10 4', 'M19 20 14 4', 'M12 6v2', 'M12 11v2', 'M12 16v2'],
  place: ['M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z', 'M14.5 10a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z'],
  address: ['M4 11.5 12 4l8 7.5', 'M6 10v10h12V10', 'M10 20v-5h4v5'],
  locate: ['M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0z', 'M15.2 12a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0z'],
};

function icon(kind: string): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 's-icon');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[kind] ?? ICONS.place!) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** The typed words in bold. */
function highlighted(text: string, query: string): Child[] {
  const out: Child[] = [];
  let at = 0;
  for (const [start, end] of highlightRanges(text, query)) {
    if (start > at) out.push(text.slice(at, start));
    out.push(h('mark', null, text.slice(start, end)));
    at = end;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** The same city from the Census list and from Photon should appear once. */
function sameness(p: Place): string {
  const state = /\b([A-Z]{2})(?: \d{5})?$/.exec(p.detail)?.[1] ?? '';
  return `${foldText(p.label)}|${state}`;
}

/** Whether results fetched for `older` still fit what's typed now (they share a start). */
function stillRelevant(older: string, now: string): boolean {
  const a = foldText(older);
  const b = foldText(now);
  const shared = Math.min(a.length, b.length);
  return shared >= 3 && a.slice(0, shared) === b.slice(0, shared);
}

export class AddressBox {
  place: Place | null = null;
  readonly input: HTMLInputElement;
  private readonly list: HTMLUListElement;
  /** Where to bias results toward: the other address, or the map's view. */
  private readonly near: () => LngLat | undefined;
  private readonly onPick: () => void;
  private readonly onLocate: (() => void) | null;
  private items: Item[] = [];
  private itemsFor = '';
  private active = -1;
  private cities: { query: string; places: Place[] } = { query: '', places: [] };
  private remote: { query: string; places: Place[] } | null = null;
  private failed = false;
  /** Ids of the newest request sent and of the newest answer shown. */
  private sent = 0;
  private shown = 0;
  private inFlight = 0;
  private lastSentAt = 0;
  private timer = 0;

  constructor(
    input: HTMLInputElement,
    list: HTMLUListElement,
    near: () => LngLat | undefined,
    onPick: () => void,
    onLocate: (() => void) | null = null,
  ) {
    this.input = input;
    this.list = list;
    this.near = near;
    this.onPick = onPick;
    this.onLocate = onLocate;
    input.addEventListener('input', () => this.onInput());
    input.addEventListener('keydown', (e) => this.onKey(e));
    input.addEventListener('focus', () => this.onFocus());
    input.addEventListener('blur', () =>
      window.setTimeout(() => {
        if (document.activeElement !== this.input) this.close();
      }, 150),
    );
    // Keep the focus in the box while a suggestion is clicked or tapped.
    list.addEventListener('mousedown', (e) => e.preventDefault());
  }

  set(place: Place | null): void {
    window.clearTimeout(this.timer);
    this.place = place;
    this.input.value = place ? (place.detail ? `${place.label}, ${place.detail}` : place.label) : '';
    this.close();
  }

  /** The chosen place, or the best match for whatever was typed. */
  async resolve(): Promise<Place | null> {
    if (this.place) return this.place;
    const q = this.query();
    if (!q) return null;
    // What the list is showing for exactly this text, if anything.
    const first = this.itemsFor === q ? this.items.find((it) => it.type === 'place') : undefined;
    if (first?.type === 'place') {
      this.set(first.place);
      return first.place;
    }
    // A city typed in full ("Boulder" or "Boulder, CO") doesn't need to wait for the geocoder.
    const city = /^\d/.test(q) ? undefined : (await localPlaces(q, this.near(), 1))[0];
    const best = city && foldText(city.label) === foldText(q.split(',')[0] ?? '') ? city : ((await searchPlaces(q, this.near()).catch(() => []))[0] ?? city);
    if (best) this.set(best);
    return best ?? null;
  }

  close(): void {
    this.list.hidden = true;
    this.active = -1;
    this.input.setAttribute('aria-expanded', 'false');
    this.input.removeAttribute('aria-activedescendant');
  }

  // ------------------------------------------------------------ typing --

  private query(): string {
    return this.input.value.trim();
  }

  private onFocus(): void {
    if (window.matchMedia('(max-width: 959px)').matches) {
      // On a phone, bring the box to the top so its suggestions aren't hidden under the keyboard.
      this.input.closest('.field')?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
    if (!this.place) this.render();
  }

  private onInput(): void {
    this.place = null;
    this.active = -1;
    const q = this.query();
    if (q.length >= 2 && !/^\d/.test(q)) void this.updateCities(q);
    else this.cities = { query: q, places: [] };
    this.scheduleRemote();
    this.render();
  }

  private async updateCities(q: string): Promise<void> {
    const places = await localPlaces(q, this.near(), MAX_CITIES);
    if (this.query() !== q) return; // typed on since; that keystroke fetches its own
    this.cities = { query: q, places };
    this.render();
  }

  private scheduleRemote(): void {
    window.clearTimeout(this.timer);
    if (this.query().length < 3) return;
    const wait = Date.now() - this.lastSentAt >= MAX_WAIT_MS ? 0 : DEBOUNCE_MS;
    this.timer = window.setTimeout(() => this.sendRemote(), wait);
  }

  private sendRemote(): void {
    const q = this.query();
    if (q.length < 3 || this.place) return;
    if (this.inFlight >= MAX_IN_FLIGHT) {
      this.timer = window.setTimeout(() => this.sendRemote(), DEBOUNCE_MS);
      return;
    }
    const id = ++this.sent;
    this.inFlight++;
    this.lastSentAt = Date.now();
    searchPlaces(q, this.near())
      .then((places) => {
        if (id < this.shown) return; // a newer answer is already on screen
        this.shown = id;
        this.failed = false;
        this.remote = { query: q, places };
      })
      .catch(() => {
        if (id < this.shown) return;
        this.shown = id;
        this.failed = true;
      })
      .finally(() => {
        this.inFlight--;
        this.render();
      });
    this.render();
  }

  // --------------------------------------------------------------- list --

  private render(): void {
    const q = this.query();
    const items: Item[] = [];
    if (!q) {
      if (this.onLocate) items.push({ type: 'locate' });
    } else if (!this.place) {
      const cities = stillRelevant(this.cities.query, q) || this.cities.query === q ? this.cities.places : [];
      const listed = new Set(cities.map(sameness));
      const remote = this.remote && stillRelevant(this.remote.query, q) ? this.remote.places.filter((p) => !listed.has(sameness(p))) : [];
      for (const place of [...cities, ...remote].slice(0, MAX_ITEMS)) items.push({ type: 'place', place });
    }
    this.items = items;
    this.itemsFor = q;
    if (this.active >= items.length) this.active = -1;

    let note: Child[] | null = null;
    if (q.length >= 3 && !this.place) {
      if (this.sent > this.shown) note = [h('span', { class: 's-spinner', 'aria-hidden': 'true' }), 'Searching addresses and places…'];
      else if (this.failed) note = ['Address search isn’t answering right now. Cities still work.'];
      else if (!items.length && this.shown > 0) note = ['No matches. Try adding a city, state or ZIP code.'];
    }

    this.list.replaceChildren(
      ...items.map((item, i) => {
        const attrs = {
          id: `${this.list.id}-${i}`,
          role: 'option',
          'aria-selected': i === this.active ? 'true' : 'false',
          onclick: () => this.pick(i),
        };
        if (item.type === 'locate') {
          return h('li', { ...attrs, class: 's-item s-locate' }, icon('locate'), h('span', { class: 's-label' }, 'Use my current location'));
        }
        const p = item.place;
        return h(
          'li',
          { ...attrs, class: 's-item' },
          icon(p.kind ?? 'place'),
          h('span', { class: 's-label' }, ...highlighted(p.label, q)),
          p.detail ? h('span', { class: 's-detail' }, p.detail) : null,
        );
      }),
      ...(note ? [h('li', { class: 's-note', role: 'presentation' }, ...note)] : []),
    );

    if (this.list.children.length && document.activeElement === this.input) {
      this.list.hidden = false;
      this.input.setAttribute('aria-expanded', 'true');
    } else this.close();
  }

  private move(delta: number): void {
    if (!this.items.length) return;
    this.active = (this.active + delta + this.items.length) % this.items.length;
    this.list.querySelectorAll('[role="option"]').forEach((li, i) => li.setAttribute('aria-selected', i === this.active ? 'true' : 'false'));
    this.input.setAttribute('aria-activedescendant', `${this.list.id}-${this.active}`);
    this.list.children[this.active]?.scrollIntoView({ block: 'nearest' });
  }

  private pick(i: number): void {
    const item = this.items[i];
    if (!item) return;
    if (item.type === 'locate') {
      this.close();
      this.onLocate?.();
      return;
    }
    this.set(item.place);
    this.onPick();
  }

  private onKey(e: KeyboardEvent): void {
    const open = !this.list.hidden;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) this.render();
      this.move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.move(-1);
    } else if (e.key === 'Enter' && open && !this.place) {
      // Like most search boxes: Enter takes the highlighted suggestion, or the top one.
      const i = this.active >= 0 ? this.active : this.items.findIndex((it) => it.type === 'place');
      if (i >= 0) {
        e.preventDefault();
        this.pick(i);
      }
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      this.close();
    }
  }
}
