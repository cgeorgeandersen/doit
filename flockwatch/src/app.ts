import type { Camera } from './lib/camera';
import { fmtMiles } from './lib/format';
import { reversePlace, type Place } from './lib/geocode';
import type { LngLat } from './lib/geo';
import { summarizeResponsible } from './lib/officials';
import { findRoutes, NoRouteError } from './lib/route';
import { COUNT_RULES, countAlongRoute, type Sighting } from './lib/seen';
import { decodeRoute, encodeRoute } from './lib/share';
import { camerasNearRoute } from './lib/tiles';
import { CameraCard } from './ui/card';
import { AddressBox } from './ui/combobox';
import { qs } from './ui/dom';
import { MapView } from './ui/mapView';
import { ResultsView, type ResultModel, type RouteResult } from './ui/results';
import type { Theme } from './ui/theme';

const MAX_RESPONSIBLE_LOOKUPS = 120;

export class App {
  readonly map: MapView;
  private readonly from: AddressBox;
  private readonly to: AddressBox;
  private readonly card: CameraCard;
  private readonly results: ResultsView;
  private readonly form = qs<HTMLFormElement>('#route-form');
  private readonly goButton = qs<HTMLButtonElement>('#go');
  private readonly error = qs('#form-error');
  private readonly status = qs('#map-status');
  private model: ResultModel | null = null;
  /** Where each camera stands relative to the selected route. */
  private sightings = new Map<number, Sighting>();
  private runSeq = 0;

  constructor(theme: Theme) {
    const mapWrap = qs('.map-wrap');
    this.map = new MapView(qs('#map'), theme, {
      hover: (camera, at) => this.card.hover(camera, camera ? (this.sightings.get(camera.id) ?? null) : null, at),
      select: (camera, at) => {
        if (camera) {
          this.card.pin(camera, this.sightings.get(camera.id) ?? null, at);
          this.map.focus(camera);
        } else {
          this.card.hide();
          this.map.focus(null);
        }
      },
      chooseRoute: (i) => this.selectRoute(i),
    });
    this.map.map.on('move', () => {
      if (this.card.pinned && this.card.camera) this.card.follow(this.map.project(this.card.camera));
    });

    this.card = new CameraCard(qs('#cam-card'), mapWrap, () => this.map.focus(null));

    const near = (other: () => AddressBox): (() => LngLat | undefined) => () => {
      const p = other().place;
      return p ? [p.lon, p.lat] : this.map.map.getZoom() > 7 ? this.map.center() : undefined;
    };
    this.from = new AddressBox(qs('#from-input'), qs('#from-list'), near(() => this.to), () => {
      if (!this.to.place) this.to.input.focus();
    });
    this.to = new AddressBox(qs('#to-input'), qs('#to-list'), near(() => this.from), () => {
      if (this.from.place) void this.run();
    });

    this.results = new ResultsView(qs('#results'), qs('#map-count'), {
      selectRoute: (i) => this.selectRoute(i),
      showCamera: (s) => this.showCamera(s),
      hoverCamera: (c) => this.map.focus(c ?? (this.card.pinned ? this.card.camera : null)),
      findResponsible: () => void this.findResponsible(),
      share: (button) => void this.share(button),
      reverse: () => {
        this.swap();
        void this.run();
      },
    });

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.run();
    });
    qs('#swap').addEventListener('click', () => this.swap());
    qs('#locate').addEventListener('click', (e) => this.locate(e.currentTarget as HTMLButtonElement));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.card.pinned) this.card.close();
    });
  }

  /** Fills both boxes and counts, e.g. for an example route or a shared link. */
  async go(from: Place, to: Place): Promise<void> {
    this.from.set(from);
    this.to.set(to);
    await this.run();
  }

  /** Opens a route shared as #from=lat,lon&to=lat,lon. */
  async openShared(hash: string): Promise<boolean> {
    const shared = decodeRoute(hash);
    if (!shared) return false;
    const label = async (p: LngLat, fallback: string): Promise<Place> => {
      const found = await reversePlace(p[0], p[1]).catch(() => null);
      return found ?? { label: fallback, detail: '', lon: p[0], lat: p[1] };
    };
    const [from, to] = await Promise.all([label(shared.from, 'Shared start'), label(shared.to, 'Shared destination')]);
    await this.go(from, to);
    return true;
  }

  setTheme(theme: Theme): void {
    this.map.setTheme(theme);
  }

  private async run(): Promise<void> {
    const seq = ++this.runSeq;
    this.showError(null);
    this.setBusy(true);
    try {
      const [from, to] = await Promise.all([this.from.resolve(), this.to.resolve()]);
      if (seq !== this.runSeq) return;
      if (!from || !to) {
        const missing = !from ? this.from.input : this.to.input;
        this.showError(
          missing.value.trim()
            ? `We couldn’t find “${missing.value.trim()}”. Try a fuller address or pick a suggestion.`
            : 'Enter both a starting place and a destination.',
        );
        missing.focus();
        return;
      }

      this.setStatus('Finding the route…');
      const options = await findRoutes([from.lon, from.lat], [to.lon, to.lat]);
      if (seq !== this.runSeq) return;

      this.setStatus(`Checking cameras along ${fmtMiles(options[0]!.distance)}…`);
      const loaded = await Promise.all(options.map((o) => camerasNearRoute(o.line, COUNT_RULES.corridorM)));
      if (seq !== this.runSeq) return;
      const cameras = [...new Map(loaded.flat().map((c) => [c.id, c])).values()];

      const results: RouteResult[] = options.map((option) => {
        const count = countAlongRoute(option.line, cameras);
        const flock = count.seen.filter((s) => s.camera.flock).length;
        return { option, count, flock, other: count.seen.length - flock };
      });
      this.model = { from, to, results, selected: 0 };
      this.setStatus('');
      document.body.classList.add('has-result');
      this.card.hide();
      this.map.focus(null);
      if (window.matchMedia('(max-width: 959px)').matches) qs('.map-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.applySelection(true);
    } catch (err) {
      if (seq !== this.runSeq) return;
      this.setStatus('');
      this.showError(
        err instanceof NoRouteError
          ? err.message
          : `Something went wrong: ${err instanceof Error ? err.message : String(err)}. Please try again in a moment.`,
      );
    } finally {
      if (seq === this.runSeq) this.setBusy(false);
    }
  }

  private applySelection(animate: boolean): void {
    const m = this.model;
    if (!m) return;
    const r = m.results[m.selected]!;
    this.sightings = new Map([...r.count.seen, ...r.count.passedBy].map((s) => [s.camera.id, s]));
    // Flock cameras among the first k sightings, for the counter while the route draws.
    const flockBefore = [0];
    for (const s of r.count.seen) flockBefore.push(flockBefore[flockBefore.length - 1]! + (s.camera.flock ? 1 : 0));
    this.results.show(m, { countFrom: animate ? 0 : undefined });
    void this.map.showRoutes(
      { routes: m.results.map((x) => x.option), selected: m.selected, seen: r.count.seen, passedBy: r.count.passedBy },
      { animate, fit: animate, onDraw: (k) => this.results.setDrawnCount(flockBefore[k] ?? r.flock) },
    );
  }

  private selectRoute(i: number): void {
    if (!this.model || i === this.model.selected || !this.model.results[i]) return;
    this.model = { ...this.model, selected: i };
    this.card.hide();
    this.map.focus(null);
    this.applySelection(false);
  }

  private showCamera(s: Sighting): void {
    const camera: Camera = s.camera;
    this.map.focus(camera);
    this.map.flyToCamera(camera);
    let done = false;
    const pin = () => {
      if (done) return;
      done = true;
      this.card.pin(camera, s, this.map.project(camera));
    };
    this.map.map.once('moveend', pin);
    window.setTimeout(pin, 900);
  }

  private async findResponsible(): Promise<void> {
    const model = this.model;
    if (!model) return;
    const seen = model.results[model.selected]!.count.seen;
    // Each camera is one Census lookup; on a very long drive, the first stretch is enough to show who's involved.
    const checked = seen.slice(0, MAX_RESPONSIBLE_LOOKUPS);
    this.results.setResponsible({ state: 'loading', done: 0, total: checked.length });
    const summary = await summarizeResponsible(
      checked.map((s) => s.camera),
      (done, total) => {
        if (this.model === model) this.results.setResponsible({ state: 'loading', done, total });
      },
    );
    if (this.model === model) this.results.setResponsible({ state: 'done', summary, checked: checked.length, total: seen.length });
  }

  private async share(button: HTMLButtonElement): Promise<void> {
    const m = this.model;
    if (!m) return;
    history.replaceState(null, '', encodeRoute([m.from.lon, m.from.lat], [m.to.lon, m.to.lat]));
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      button.textContent = 'Link copied';
    } catch {
      window.prompt('Copy this link:', url);
    }
  }

  private swap(): void {
    const a = this.from.place;
    const aText = this.from.input.value;
    const b = this.to.place;
    const bText = this.to.input.value;
    if (b) this.from.set(b);
    else this.from.input.value = bText;
    if (a) this.to.set(a);
    else this.to.input.value = aText;
    if (!b) this.from.place = null;
    if (!a) this.to.place = null;
  }

  private locate(button: HTMLButtonElement): void {
    if (!('geolocation' in navigator)) return this.showError('This browser can’t share its location.');
    button.setAttribute('aria-busy', 'true');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const near = await reversePlace(coords.longitude, coords.latitude).catch(() => null);
        this.from.set({
          label: 'Current location',
          detail: near ? near.label.replace(/^Near /, 'near ') : '',
          lon: coords.longitude,
          lat: coords.latitude,
        });
        button.removeAttribute('aria-busy');
        if (this.to.place) void this.run();
        else this.to.input.focus();
      },
      () => {
        button.removeAttribute('aria-busy');
        this.showError('Couldn’t get your location. Type an address instead.');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  private setBusy(busy: boolean): void {
    this.goButton.toggleAttribute('aria-busy', busy);
    this.goButton.textContent = busy ? 'Counting…' : 'Count the cameras';
  }

  private setStatus(text: string): void {
    this.status.textContent = text;
  }

  private showError(text: string | null): void {
    this.error.hidden = !text;
    this.error.textContent = text ?? '';
  }
}
