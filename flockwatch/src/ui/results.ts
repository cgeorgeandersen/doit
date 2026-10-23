/**
 * The results under the form: the count, who answers for those cameras, route
 * choices and the camera list. A town shows the same, for the cameras inside it.
 */

import type { Camera } from '../lib/camera';
import { describeDirection, parseDirection } from '../lib/direction';
import { fmtDuration, fmtInt, fmtMiles, plural, spacing } from '../lib/format';
import type { Place } from '../lib/geocode';
import type { ResponsibleSummary } from '../lib/officials';
import type { RouteOption } from '../lib/route';
import type { RouteCount } from '../lib/seen';
import type { Town } from '../lib/town';
import { boardButton, bodyButton, contactButtons } from './contact';
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

export interface TownResult {
  town: Town;
  /** Every mapped plate reader inside the town, Flock first. */
  cameras: Camera[];
  flock: number;
  other: number;
}

export interface ResultHandlers {
  selectRoute(index: number): void;
  showCamera(camera: Camera): void;
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
/** Legislators shown before "Show all": a long drive can cross a dozen districts. */
const PEOPLE_PREVIEW = 4;

export class ResultsView {
  private readonly root: HTMLElement;
  private readonly mapCount: HTMLElement;
  private readonly handlers: ResultHandlers;
  private model: ResultModel | null = null;
  private town: TownResult | null = null;
  private expanded = false;
  private peopleExpanded = false;
  private responsible: ResponsibleState = { state: 'idle' };
  private bigNumber: HTMLElement | null = null;

  constructor(root: HTMLElement, mapCount: HTMLElement, handlers: ResultHandlers) {
    this.root = root;
    this.mapCount = mapCount;
    this.handlers = handlers;
  }

  show(model: ResultModel, opts: { countFrom?: number } = {}): void {
    if (model !== this.model) this.reset();
    this.model = model;
    this.town = null;
    this.render(opts.countFrom);
  }

  showTown(town: TownResult): void {
    if (town !== this.town) this.reset();
    this.town = town;
    this.model = null;
    this.render();
  }

  private reset(): void {
    this.expanded = false;
    this.peopleExpanded = false;
    this.responsible = { state: 'idle' };
  }

  clear(): void {
    this.model = null;
    this.town = null;
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
    if (this.town) return this.renderTown(this.town);
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
      h('div', { 'data-slot': 'responsible' }, ...this.renderResponsible()),
      m.results.length > 1 ? this.renderRoutes(m) : null,
      this.renderList(r),
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

  private renderTown(t: TownResult): void {
    const n = t.cameras.length;
    const name = t.town.name;
    this.bigNumber = h('span', { class: 'big-number', 'data-zero': n === 0 ? '' : null }, fmtInt(n));
    fill(this.mapCount, h('b', null, fmtInt(n)), ` plate ${plural(n, 'reader', 'readers')} in ${name}`);

    fill(
      this.root,
      h(
        'div',
        { class: 'result-head' },
        h(
          'p',
          { class: 'big-count' },
          this.bigNumber,
          h('span', { class: 'big-label' }, `license plate ${plural(n, 'camera', 'cameras')} mapped inside ${name}`),
        ),
        n > 0
          ? h('p', { class: 'result-sub' }, 'Each one records the plate, make and color of every car that passes, and the time.')
          : h(
              'p',
              { class: 'result-sub' },
              `No mapped plate readers inside ${name}. That doesn’t mean there are none: only the cameras volunteers have found are on the map. `,
              h('a', { href: 'https://deflock.me', target: '_blank', rel: 'noopener' }, 'Help map them'),
              '.',
            ),
        n > 0
          ? h(
              'div',
              { class: 'tallies' },
              h('span', { class: 'tally' }, h('i', { class: 'key key-flock' }), h('b', null, fmtInt(t.flock)), ' Flock'),
              t.other > 0
                ? h('span', { class: 'tally' }, h('i', { class: 'key key-other' }), h('b', null, fmtInt(t.other)), ` other plate ${plural(t.other, 'reader', 'readers')}`)
                : null,
            )
          : null,
        h(
          'p',
          { class: 'trip' },
          t.town.incorporated
            ? `Inside the limits of ${t.town.censusName}, ${t.town.state}`
            : `${name}, ${t.town.state} is an unincorporated community, governed by its county`,
        ),
      ),
      h('div', { 'data-slot': 'responsible' }, ...this.renderResponsible()),
      this.cameraList(
        `Cameras in ${name} (${fmtInt(n)})`,
        t.cameras.map((camera) => ({ camera, at: '' })),
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'button', class: 'button', onclick: (e: Event) => this.handlers.share(e.currentTarget as HTMLButtonElement) }, 'Copy link to this town'),
      ),
      h(
        'p',
        { class: 'note' },
        'Counts include only cameras volunteers have mapped, so the real number may be higher. The outline is the Census Bureau’s boundary. ',
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
    return this.cameraList(
      `Cameras along the way (${fmtInt(r.count.seen.length)})`,
      r.count.seen.map((s) => ({ camera: s.camera, at: `mi ${(s.along / 1609.344).toFixed(1)}` })),
    );
  }

  /** A numbered list of cameras, each one a button that shows it on the map. */
  private cameraList(title: string, rows: Array<{ camera: Camera; at: string }>): HTMLElement | null {
    if (!rows.length) return null;
    const shown = this.expanded ? rows : rows.slice(0, LIST_PREVIEW);
    return h(
      'div',
      null,
      h('p', { class: 'block-title' }, title),
      h(
        'ol',
        { class: 'cam-list' },
        shown.map(({ camera: c, at }, i) => {
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
                onclick: () => this.handlers.showCamera(c),
                onmouseenter: () => this.handlers.hoverCamera(c),
                onmouseleave: () => this.handlers.hoverCamera(null),
                onfocus: () => this.handlers.hoverCamera(c),
                onblur: () => this.handlers.hoverCamera(null),
              },
              h('span', { class: 'cam-index', 'data-kind': c.flock ? 'flock' : 'other' }, String(i + 1)),
              h('span', { class: 'cam-what' }, h('b', null, what), h('span', null, detail)),
              at ? h('span', { class: 'cam-at' }, at) : null,
            ),
          );
        }),
      ),
      rows.length > LIST_PREVIEW
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
            this.expanded ? 'Show fewer' : `Show all ${fmtInt(rows.length)}`,
          )
        : null,
    );
  }

  private renderResponsible(): Child[] {
    const m = this.model;
    const total = this.town ? this.town.cameras.length : m ? m.results[m.selected]!.count.seen.length : 0;
    if (!total) return [];
    const st = this.responsible;
    const these = plural(total, 'this camera', `these ${fmtInt(total)} cameras`);
    const title = h('h2', { class: 'who-title' }, `Who answers for ${these}`);

    if (st.state === 'idle') {
      return [
        h(
          'div',
          { class: 'who-block' },
          title,
          h('p', { class: 'who-why' }, 'A city council or county commission usually approves the camera contract, and can cancel it.'),
          h(
            'button',
            { type: 'button', class: 'button button-civic button-wide', onclick: () => this.handlers.findResponsible() },
            `Find who answers for ${these}`,
          ),
          h('p', { class: 'note' }, 'Looks up the city or county, state legislators and members of Congress for each camera’s location.'),
        ),
      ];
    }
    if (st.state === 'loading') {
      return [
        h(
          'div',
          { class: 'who-block' },
          title,
          h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': st.total, 'aria-valuenow': st.done }, h('i', { style: `width: ${(100 * st.done) / Math.max(1, st.total)}%` })),
          h('p', { class: 'note' }, `Checked ${fmtInt(st.done)} of ${fmtInt(st.total)} cameras…`),
        ),
      ];
    }

    const s = st.summary;
    const where = this.town ? 'town' : 'drive';
    // A county already listed for its unincorporated land, with every one of its cameras there, needn't appear twice.
    const boards = s.boards.filter((b) => !s.places.some((p) => p.board === b.board && p.cameras === b.cameras));
    const people = [...s.legislators, ...s.congress];
    const shownPeople = this.peopleExpanded ? people : people.slice(0, PEOPLE_PREVIEW);
    const tally = [
      s.places.length ? `${fmtInt(s.places.length)} local ${plural(s.places.length, 'government', 'governments')}` : '',
      people.length ? `${fmtInt(people.length)} ${plural(people.length, 'legislator', 'legislators')}` : '',
    ].filter(Boolean);
    return [
      h(
        'div',
        { class: 'who-block' },
        title,
        tally.length ? h('p', { class: 'who-tally' }, `${tally.join(' and ')}. Start with the council or commission: it usually approves the contract, and can cancel it.`) : null,
        h(
          'ul',
          { class: 'gov-list' },
          s.places.map((p, i) =>
            h(
              'li',
              { 'data-lead': i === 0 ? '' : null },
              h('span', { class: 'gov-name' }, p.label),
              h('span', { class: 'gov-count' }, `${fmtInt(p.cameras)} ${plural(p.cameras, 'camera', 'cameras')}`),
              h('span', { class: 'gov-people' }, p.official ? `${p.official.role} ${p.official.name} · ${p.body}` : p.body),
              h(
                'span',
                { class: 'gov-actions' },
                p.board
                  ? boardButton(p.board, { cameras: p.cameras, where }, i === 0 ? 'primary' : 'small')
                  : bodyButton(p.body, p.website, i === 0 ? 'primary' : 'small'),
              ),
            ),
          ),
        ),
        boards.length
          ? h(
              'div',
              null,
              h('p', { class: 'block-title' }, 'County commissioners for these cameras'),
              h('p', { class: 'who-why' }, 'They set the sheriff’s budget and vote on county camera contracts, inside city limits or not.'),
              h(
                'ul',
                { class: 'gov-list' },
                boards.map((b) =>
                  h(
                    'li',
                    null,
                    h('span', { class: 'gov-name' }, b.label),
                    h('span', { class: 'gov-count' }, `${fmtInt(b.cameras)} ${plural(b.cameras, 'camera', 'cameras')}`),
                    h('span', { class: 'gov-people' }, `${b.board.body} · ${b.board.members.map((m) => m.name).join(', ')}`),
                    h('span', { class: 'gov-actions' }, boardButton(b.board, { cameras: b.cameras, where }, 'small')),
                  ),
                ),
              ),
            )
          : null,
        people.length
          ? h(
              'div',
              null,
              h('p', { class: 'block-title' }, 'Legislators for these camera locations'),
              h(
                'ul',
                { class: 'gov-list' },
                shownPeople.map((p) =>
                  h(
                    'li',
                    null,
                    h('span', { class: 'gov-name' }, p.name, p.party ? ` (${p.party})` : ''),
                    h('span', { class: 'gov-count' }, `${fmtInt(p.cameras)} ${plural(p.cameras, 'camera', 'cameras')}`),
                    h(
                      'span',
                      { class: 'gov-people' },
                      [p.role, p.district && p.role !== 'U.S. senator' ? (/^\d/.test(p.district) ? `District ${p.district}` : p.district) : ''].filter(Boolean).join(' · '),
                    ),
                    h('span', { class: 'gov-actions' }, contactButtons(p)),
                  ),
                ),
              ),
              people.length > PEOPLE_PREVIEW
                ? h(
                    'button',
                    {
                      type: 'button',
                      class: 'button more',
                      onclick: () => {
                        this.peopleExpanded = !this.peopleExpanded;
                        this.setResponsible(this.responsible);
                      },
                    },
                    this.peopleExpanded ? 'Show fewer' : `Show all ${fmtInt(people.length)} legislators`,
                  )
                : null,
            )
          : null,
        st.checked < st.total
          ? h(
              'p',
              { class: 'note' },
              this.town
                ? `Covers ${fmtInt(st.checked)} cameras spread across ${this.town.town.name}, of its ${fmtInt(st.total)}.`
                : `Covers the first ${fmtInt(st.checked)} of the ${fmtInt(st.total)} cameras on this drive.`,
            )
          : null,
        s.unresolved ? h('p', { class: 'note' }, `${fmtInt(s.unresolved)} ${plural(s.unresolved, 'camera', 'cameras')} couldn’t be looked up.`) : null,
        h('p', { class: 'note' }, 'Tap a camera on the map for its own contacts. Mayors come from Wikidata and can lag after an election.'),
      ),
    ];
  }
}
