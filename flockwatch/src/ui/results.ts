/** The results under the form: the count, route choices, the camera list and who's responsible. */

import type { Camera } from '../lib/camera';
import { describeDirection, parseDirection } from '../lib/direction';
import { fmtDuration, fmtInt, fmtMiles, plural, spacing } from '../lib/format';
import type { Place } from '../lib/geocode';
import type { ResponsibleSummary } from '../lib/officials';
import type { RouteOption } from '../lib/route';
import type { RouteCount, Sighting } from '../lib/seen';
import { fill, h, type Child } from './dom';

export interface RouteResult {
  option: RouteOption;
  count: RouteCount;
  flock: number;
  other: number;
}

export interface ResultModel {
  from: Place;
  to: Place;
  results: RouteResult[];
  selected: number;
}

export interface ResultHandlers {
  selectRoute(index: number): void;
  showCamera(sighting: Sighting): void;
  hoverCamera(camera: Camera | null): void;
  findResponsible(): void;
  share(button: HTMLButtonElement): void;
  reverse(): void;
}

export type ResponsibleState =
  | { state: 'idle' }
  | { state: 'loading'; done: number; total: number }
  | { state: 'done'; summary: ResponsibleSummary; checked: number; total: number };

const LIST_PREVIEW = 8;

export class ResultsView {
  private readonly root: HTMLElement;
  private readonly mapCount: HTMLElement;
  private readonly handlers: ResultHandlers;
  private model: ResultModel | null = null;
  private expanded = false;
  private responsible: ResponsibleState = { state: 'idle' };
  private bigNumber: HTMLElement | null = null;

  constructor(root: HTMLElement, mapCount: HTMLElement, handlers: ResultHandlers) {
    this.root = root;
    this.mapCount = mapCount;
    this.handlers = handlers;
  }

  show(model: ResultModel, opts: { countFrom?: number } = {}): void {
    if (model !== this.model) {
      this.expanded = false;
      this.responsible = { state: 'idle' };
    }
    this.model = model;
    this.render(opts.countFrom);
  }

  clear(): void {
    this.model = null;
    this.root.replaceChildren();
    this.mapCount.replaceChildren();
  }

  /** Updates the big number while the route draws. */
  setDrawnCount(n: number): void {
    if (this.bigNumber) this.bigNumber.textContent = fmtInt(n);
  }

  setResponsible(state: ResponsibleState): void {
    this.responsible = state;
    const slot = this.root.querySelector<HTMLElement>('[data-slot="responsible"]');
    if (slot) fill(slot, this.renderResponsible());
  }

  private render(countFrom?: number): void {
    const m = this.model;
    if (!m) return;
    const r = m.results[m.selected]!;
    const n = r.flock;

    this.bigNumber = h('span', { class: 'big-number', 'data-zero': n === 0 ? '' : null }, fmtInt(countFrom ?? n));
    const gap = spacing(r.option.distance, n);
    const passed = r.count.passedBy.length;

    fill(this.mapCount, h('b', null, fmtInt(n)), ` Flock ${plural(n, 'camera', 'cameras')} on this route`);

    fill(
      this.root,
      h(
        'div',
        { class: 'result-head' },
        h(
          'p',
          { class: 'big-count' },
          this.bigNumber,
          h('span', { class: 'big-label' }, n === 1 ? 'Flock camera would photograph your car on this drive' : 'Flock cameras would photograph your car on this drive'),
        ),
        n > 0
          ? h('p', { class: 'result-sub' }, gap ? `That’s ${gap}. ` : '', 'Each one records your plate, your car’s make and color, and the time you passed.')
          : h(
              'p',
              { class: 'result-sub' },
              'No mapped Flock cameras on this route. That doesn’t mean there are none: only the cameras volunteers have found are on the map. ',
              h('a', { href: 'https://deflock.me', target: '_blank', rel: 'noopener' }, 'Help map them'),
              '.',
            ),
        h(
          'div',
          { class: 'tallies' },
          r.other > 0
            ? h('span', { class: 'tally' }, h('i', { class: 'key key-other' }), h('b', null, `+${fmtInt(r.other)}`), ` other plate ${plural(r.other, 'reader', 'readers')}`)
            : null,
          passed > 0 ? h('span', { class: 'tally' }, h('i', { class: 'key key-passed' }), h('b', null, fmtInt(passed)), ' nearby, not counted') : null,
        ),
        h('p', { class: 'trip' }, `${fmtMiles(r.option.distance)} · ${fmtDuration(r.option.duration)} · ${m.from.label} → ${m.to.label}`),
      ),
      m.results.length > 1 ? this.renderRoutes(m) : null,
      this.renderList(r),
      h('div', { 'data-slot': 'responsible' }, ...this.renderResponsible()),
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'button', class: 'button', onclick: (e: Event) => this.handlers.share(e.currentTarget as HTMLButtonElement) }, 'Copy link to this route'),
        h('button', { type: 'button', class: 'button', onclick: () => this.handlers.reverse() }, 'Reverse direction'),
      ),
      h(
        'p',
        { class: 'note' },
        'Counts include only cameras volunteers have mapped, so the real number may be higher. ',
        h('a', { href: '#method' }, 'How we count'),
        '.',
      ),
    );
  }

  private renderRoutes(m: ResultModel): HTMLElement {
    const fastest = m.results[0]!;
    const fewest = Math.min(...m.results.map((r) => r.flock));
    return h(
      'div',
      null,
      h('p', { class: 'block-title' }, 'Routes'),
      h(
        'div',
        { class: 'routes' },
        m.results.map((r, i) => {
          const extra = r.option.duration - fastest.option.duration;
          const name = i === 0 ? 'Fastest' : `Option ${i + 1}`;
          const isFewest = r.flock === fewest && r.flock < fastest.flock;
          return h(
            'button',
            { type: 'button', class: 'route-option', 'aria-pressed': String(i === m.selected), onclick: () => this.handlers.selectRoute(i) },
            h('span', { class: 'route-swatch', 'aria-hidden': 'true' }),
            h(
              'span',
              { class: 'route-main' },
              h('span', { class: 'route-name' }, name, isFewest ? h('span', { class: 'badge' }, 'Fewest cameras') : null),
              h('span', { class: 'route-meta' }, `${fmtDuration(r.option.duration)}${i > 0 && extra > 30 ? ` (+${fmtDuration(extra)})` : ''} · ${fmtMiles(r.option.distance)}`),
            ),
            h('span', { class: 'route-cams' }, fmtInt(r.flock), h('small', null, 'Flock')),
          );
        }),
      ),
    );
  }

  private renderList(r: RouteResult): HTMLElement | null {
    const seen = r.count.seen;
    if (!seen.length) return null;
    const shown = this.expanded ? seen : seen.slice(0, LIST_PREVIEW);
    return h(
      'div',
      null,
      h('p', { class: 'block-title' }, `Cameras along the way (${fmtInt(seen.length)})`),
      h(
        'ol',
        { class: 'cam-list' },
        shown.map((s, i) => {
          const c = s.camera;
          const what = c.flock ? 'Flock Safety' : c.brand || 'Plate reader';
          const detail = [describeDirection(parseDirection(c.direction)), c.operator].filter(Boolean).join(' · ');
          return h(
            'li',
            null,
            h(
              'button',
              {
                type: 'button',
                class: 'cam-row',
                onclick: () => this.handlers.showCamera(s),
                onmouseenter: () => this.handlers.hoverCamera(c),
                onmouseleave: () => this.handlers.hoverCamera(null),
                onfocus: () => this.handlers.hoverCamera(c),
                onblur: () => this.handlers.hoverCamera(null),
              },
              h('span', { class: 'cam-index', 'data-kind': c.flock ? 'flock' : 'other' }, String(i + 1)),
              h('span', { class: 'cam-what' }, h('b', null, what), h('span', null, detail)),
              h('span', { class: 'cam-at' }, `mi ${(s.along / 1609.344).toFixed(1)}`),
            ),
          );
        }),
      ),
      seen.length > LIST_PREVIEW
        ? h(
            'button',
            {
              type: 'button',
              class: 'button more',
              onclick: () => {
                this.expanded = !this.expanded;
                this.render();
              },
            },
            this.expanded ? 'Show fewer' : `Show all ${fmtInt(seen.length)}`,
          )
        : null,
    );
  }

  private renderResponsible(): Child[] {
    const m = this.model;
    if (!m) return [];
    const total = m.results[m.selected]!.count.seen.length;
    if (!total) return [];
    const st = this.responsible;
    const title = h('p', { class: 'block-title' }, 'Who’s responsible');

    if (st.state === 'idle') {
      return [
        title,
        h(
          'button',
          { type: 'button', class: 'button button-primary button-wide', onclick: () => this.handlers.findResponsible() },
          `Find who answers for ${plural(total, 'this camera', `these ${fmtInt(total)} cameras`)}`,
        ),
        h('p', { class: 'note', style: 'margin-top: 6px' }, 'Looks up the city or county, state legislators and members of Congress for each camera’s location.'),
      ];
    }
    if (st.state === 'loading') {
      return [
        title,
        h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': st.total, 'aria-valuenow': st.done }, h('i', { style: `width: ${(100 * st.done) / Math.max(1, st.total)}%` })),
        h('p', { class: 'note', style: 'margin-top: 6px' }, `Checked ${fmtInt(st.done)} of ${fmtInt(st.total)} cameras…`),
      ];
    }

    const s = st.summary;
    const people = [...s.legislators, ...s.congress.filter((p) => p.role !== 'U.S. senator')];
    const senators = s.congress.filter((p) => p.role === 'U.S. senator');
    return [
      title,
      h(
        'div',
        { class: 'responsible' },
        h(
          'ul',
          { class: 'gov-list' },
          s.places.map((p) =>
            h(
              'li',
              null,
              h('span', { class: 'gov-name' }, p.label),
              h('span', { class: 'gov-count' }, `${fmtInt(p.cameras)} ${plural(p.cameras, 'camera', 'cameras')}`),
              h(
                'span',
                { class: 'gov-people' },
                p.official ? `${p.official.role} ${p.official.name} · ${p.body}` : p.body,
                p.website ? [' · ', h('a', { href: p.website, target: '_blank', rel: 'noopener' }, 'Website')] : null,
              ),
            ),
          ),
        ),
        people.length
          ? h(
              'div',
              null,
              h('p', { class: 'block-title' }, 'Legislators for these camera locations'),
              h(
                'ul',
                { class: 'gov-list' },
                people.map((p) =>
                  h(
                    'li',
                    null,
                    h('span', { class: 'gov-name' }, p.name, p.party ? ` (${p.party})` : ''),
                    h('span', { class: 'gov-count' }, `${fmtInt(p.cameras)} ${plural(p.cameras, 'camera', 'cameras')}`),
                    h(
                      'span',
                      { class: 'gov-people' },
                      [p.role, p.district ? (/^\d/.test(p.district) ? `District ${p.district}` : p.district) : ''].filter(Boolean).join(' · '),
                      p.email ? [' · ', h('a', { href: `mailto:${p.email}` }, 'Email')] : null,
                      p.phone ? [' · ', h('a', { href: `tel:${p.phone.replace(/[^\d+]/g, '')}` }, p.phone)] : null,
                      p.url ? [' · ', h('a', { href: p.url, target: '_blank', rel: 'noopener' }, p.source === 'congress-legislators' ? 'Contact' : 'Profile')] : null,
                    ),
                  ),
                ),
              ),
            )
          : null,
        senators.length
          ? h('p', { class: 'note' }, `U.S. senators: ${senators.map((p) => `${p.name}${p.party ? ` (${p.party})` : ''}`).join(', ')}.`)
          : null,
        st.checked < st.total ? h('p', { class: 'note' }, `Covers the first ${fmtInt(st.checked)} of the ${fmtInt(st.total)} cameras on this drive.`) : null,
        s.unresolved ? h('p', { class: 'note' }, `${fmtInt(s.unresolved)} ${plural(s.unresolved, 'camera', 'cameras')} couldn’t be looked up.`) : null,
        h('p', { class: 'note' }, 'Hover over or tap a camera on the map for its own contacts. Mayors come from Wikidata and can lag after an election.'),
      ),
    ];
  }
}
