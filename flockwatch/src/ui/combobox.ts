/**
 * An address box with suggestions, following the WAI-ARIA combobox pattern:
 * arrow keys move through suggestions, Enter picks one, Escape closes the list.
 */

import { searchPlaces, type Place } from '../lib/geocode';
import type { LngLat } from '../lib/geo';
import { h } from './dom';

export class AddressBox {
  place: Place | null = null;
  readonly input: HTMLInputElement;
  private readonly list: HTMLUListElement;
  /** Where to bias results toward: the other address, or the map's center. */
  private readonly near: () => LngLat | undefined;
  private readonly onPick: () => void;
  private suggestions: Place[] = [];
  private active = -1;
  private timer = 0;
  private controller: AbortController | null = null;

  constructor(input: HTMLInputElement, list: HTMLUListElement, near: () => LngLat | undefined, onPick: () => void) {
    this.input = input;
    this.list = list;
    this.near = near;
    this.onPick = onPick;
    input.addEventListener('input', () => {
      this.place = null;
      window.clearTimeout(this.timer);
      const q = input.value.trim();
      if (q.length < 3) return this.close();
      this.timer = window.setTimeout(() => void this.search(q), 220);
    });
    input.addEventListener('keydown', (e) => this.onKey(e));
    input.addEventListener('blur', () => window.setTimeout(() => this.close(), 150));
    input.addEventListener('focus', () => {
      if (this.suggestions.length && !this.place) this.open();
    });
  }

  set(place: Place | null): void {
    this.place = place;
    this.input.value = place ? (place.detail ? `${place.label}, ${place.detail}` : place.label) : '';
    this.close();
  }

  /** The chosen place, or the best match for whatever was typed. */
  async resolve(): Promise<Place | null> {
    if (this.place) return this.place;
    const q = this.input.value.trim();
    if (!q) return null;
    const results = await searchPlaces(q, this.near());
    if (results[0]) this.set(results[0]);
    return results[0] ?? null;
  }

  private async search(q: string): Promise<void> {
    this.controller?.abort();
    this.controller = new AbortController();
    try {
      const results = await searchPlaces(q, this.near(), this.controller.signal);
      if (this.input.value.trim() !== q || document.activeElement !== this.input) return;
      this.suggestions = results;
      this.active = -1;
      this.render(results.length ? null : 'No U.S. matches yet. Try adding a city or ZIP code.');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      this.suggestions = [];
      this.render('Address search isn’t responding. Try again in a moment.');
    }
  }

  private render(note: string | null): void {
    this.list.replaceChildren(
      ...this.suggestions.map((p, i) =>
        h(
          'li',
          {
            id: `${this.list.id}-${i}`,
            role: 'option',
            'aria-selected': i === this.active ? 'true' : 'false',
            onmousedown: (e: Event) => {
              e.preventDefault();
              this.pick(i);
            },
          },
          h('span', { class: 's-label' }, p.label),
          p.detail ? h('span', { class: 's-detail' }, p.detail) : null,
        ),
      ),
      ...(note ? [h('li', { class: 's-note', role: 'presentation' }, note)] : []),
    );
    this.open();
  }

  private open(): void {
    if (!this.list.children.length) return;
    this.list.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
  }

  close(): void {
    this.list.hidden = true;
    this.input.setAttribute('aria-expanded', 'false');
    this.input.removeAttribute('aria-activedescendant');
  }

  private move(delta: number): void {
    if (!this.suggestions.length) return;
    this.active = (this.active + delta + this.suggestions.length) % this.suggestions.length;
    [...this.list.querySelectorAll('[role="option"]')].forEach((li, i) =>
      li.setAttribute('aria-selected', i === this.active ? 'true' : 'false'),
    );
    this.input.setAttribute('aria-activedescendant', `${this.list.id}-${this.active}`);
    this.list.children[this.active]?.scrollIntoView({ block: 'nearest' });
  }

  private pick(i: number): void {
    const place = this.suggestions[i];
    if (!place) return;
    this.set(place);
    this.onPick();
  }

  private onKey(e: KeyboardEvent): void {
    const isOpen = !this.list.hidden;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) this.open();
      this.move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.move(-1);
    } else if (e.key === 'Enter' && isOpen && this.active >= 0) {
      e.preventDefault();
      this.pick(this.active);
    } else if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      this.close();
    }
  }
}
