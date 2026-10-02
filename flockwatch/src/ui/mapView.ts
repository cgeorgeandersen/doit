/**
 * The map: a heat map of every mapped camera when zoomed out, individual
 * cameras when zoomed in, and the route with the cameras that see it.
 */

import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { Camera } from '../lib/camera';
import { DEFAULT_HALF_ANGLE, parseDirection } from '../lib/direction';
import { bboxOf, cumulativeDistances, lerp, type BBox, type LngLat } from '../lib/geo';
import type { RouteOption } from '../lib/route';
import type { Sighting } from '../lib/seen';
import { camerasInBBox, tilesForBBox, type OverviewCell } from '../lib/tiles';
import { h, prefersReducedMotion } from './dom';
import { cssColor, type Theme } from './theme';

// MapLibre 6 runs its tile work in a module worker; Vite bundles it and we say where it lives.
maplibregl.setWorkerUrl(workerUrl);

const STYLES: Record<Theme, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

/** The contiguous United States, for the opening view. */
const LOWER_48: [LngLat, LngLat] = [
  [-124.8, 24.4],
  [-66.9, 49.4],
];
/** Below this zoom the heat map shows; above it, individual cameras. */
const CAMERA_ZOOM = 9;
/** Don't fetch more than this many 1° tiles for one view. */
const MAX_TILES = 16;
/** Cone images are drawn this long (pixels) and scaled to about 60 m of road. */
const CONE_LEN = 128;

type Kind = 'flock' | 'other' | 'passed';
type Pt = { x: number; y: number };

export interface MapEvents {
  hover(camera: Camera | null, at: Pt): void;
  select(camera: Camera | null, at: Pt): void;
  chooseRoute(index: number): void;
}

interface Display {
  routes: RouteOption[];
  selected: number;
  seen: Sighting[];
  passedBy: Sighting[];
}

const empty = <G extends Point | LineString>(): FeatureCollection<G> => ({ type: 'FeatureCollection', features: [] });

/** A soft wedge pointing up, apex at the bottom center: one camera's field of view. */
function coneImage(color: string, alpha: number): ImageData {
  const ratio = 2;
  const half = (DEFAULT_HALF_ANGLE * Math.PI) / 180;
  const w = Math.ceil(2 * CONE_LEN * Math.sin(half)) * ratio;
  const hgt = CONE_LEN * ratio;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hgt;
  const ctx = canvas.getContext('2d')!;
  const cx = w / 2;
  const grad = ctx.createRadialGradient(cx, hgt, 0, cx, hgt, hgt);
  grad.addColorStop(0, color);
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, 'transparent');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx, hgt);
  ctx.arc(cx, hgt, hgt, -Math.PI / 2 - half, -Math.PI / 2 + half);
  ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, w, hgt);
}

export class MapView {
  readonly map: maplibregl.Map;
  private theme: Theme;
  private readonly events: MapEvents;
  private overview: FeatureCollection<Point> = empty();
  private viewport = new Map<number, Camera>();
  private routeCams = new Map<number, Camera>();
  private display: Display | null = null;
  /** Distance along the selected route drawn so far, in meters (Infinity when complete). */
  private drawn = Infinity;
  private frame = 0;
  private markers: maplibregl.Marker[] = [];
  private focusId: number | null = null;
  private loadSeq = 0;

  constructor(container: HTMLElement, theme: Theme, events: MapEvents) {
    this.theme = theme;
    this.events = events;
    this.map = new maplibregl.Map({
      container,
      style: STYLES[theme],
      bounds: LOWER_48,
      fitBoundsOptions: { padding: 20 },
      minZoom: 2,
      maxZoom: 19,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      cooperativeGestures: false,
      attributionControl: {
        compact: true,
        customAttribution: [
          'Cameras: <a href="https://deflock.me" target="_blank" rel="noopener">DeFlock</a>',
          'Routes: <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener">FOSSGIS OSRM</a>',
          '<a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">Fix the map</a>',
        ],
      },
    });
    // The base styles reference a few sprite images they don't ship; a blank pixel keeps the console quiet.
    this.map.setMissingStyleImageResolver((id) => {
      if (!this.map.hasImage(id)) this.map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disableRotation();
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    this.map.on('style.load', () => this.installLayers());
    this.map.on('moveend', () => void this.loadViewport());
    this.map.on('zoomend', () => this.refreshCones());
    this.map.on('mousemove', (e) => this.onPointer(e.point));
    this.map.on('mouseout', () => this.events.hover(null, { x: 0, y: 0 }));
    this.map.on('click', (e) => this.onClick(e.point));
  }

  setTheme(theme: Theme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.map.setStyle(STYLES[theme]);
  }

  setOverview(cells: OverviewCell[]): void {
    this.overview = {
      type: 'FeatureCollection',
      features: cells.map(([lon, lat, f, o]) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { n: f + o, f },
      })),
    };
    this.source('overview')?.setData(this.overview);
  }

  /** Shows routes and their cameras. The selected route draws itself unless `animate` is false. */
  showRoutes(display: Display, opts: { animate: boolean; fit: boolean; onDraw?: (seen: number) => void }): Promise<void> {
    cancelAnimationFrame(this.frame);
    this.display = display;
    this.routeCams = new Map([...display.seen, ...display.passedBy].map((s) => [s.camera.id, s.camera]));
    this.refreshCams();
    const route = display.routes[display.selected]!;
    this.placeEndpoints(route.line);
    if (opts.fit) {
      const box = bboxOf(display.routes.flatMap((r) => [r.line[0]!, r.line[r.line.length - 1]!, ...r.line.filter((_, i) => i % 25 === 0)]));
      this.fit(box, !opts.animate || prefersReducedMotion());
    }
    if (!opts.animate || prefersReducedMotion()) {
      this.drawn = Infinity;
      this.refreshRoute();
      opts.onDraw?.(display.seen.length);
      return Promise.resolve();
    }

    // Draw the route from A to B and light up each camera as the line reaches it.
    const total = route.distance;
    const duration = Math.min(3200, Math.max(1500, 1200 + display.seen.length * 45));
    const start = performance.now() + (opts.fit ? 450 : 0);
    let last = -1;
    this.drawn = 0;
    this.refreshRoute();
    return new Promise((resolve) => {
      const step = (now: number) => {
        const t = Math.max(0, Math.min(1, (now - start) / duration));
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        this.drawn = t >= 1 ? Infinity : eased * total;
        const seenSoFar = display.seen.filter((s) => s.along <= this.drawn).length;
        if (seenSoFar !== last || t >= 1 || Math.round(now / 33) % 2 === 0) this.refreshRoute();
        if (seenSoFar !== last) {
          last = seenSoFar;
          opts.onDraw?.(seenSoFar);
        }
        if (t < 1) this.frame = requestAnimationFrame(step);
        else resolve();
      };
      this.frame = requestAnimationFrame(step);
    });
  }

  clearRoutes(): void {
    cancelAnimationFrame(this.frame);
    this.display = null;
    this.routeCams.clear();
    for (const m of this.markers) m.remove();
    this.markers = [];
    this.refreshCams();
    this.refreshRoute();
  }

  /** Rings one camera (from the list or a click), or none. */
  focus(camera: Camera | null): void {
    this.focusId = camera?.id ?? null;
    this.source('focus')?.setData({
      type: 'FeatureCollection',
      features: camera ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [camera.lon, camera.lat] }, properties: {} }] : [],
    });
  }

  flyToCamera(camera: Camera): void {
    this.map.easeTo({
      center: [camera.lon, camera.lat],
      zoom: Math.max(this.map.getZoom(), 16),
      duration: prefersReducedMotion() ? 0 : 700,
    });
  }

  project(camera: Camera): Pt {
    const p = this.map.project([camera.lon, camera.lat]);
    return { x: p.x, y: p.y };
  }

  center(): LngLat {
    const c = this.map.getCenter();
    return [c.lng, c.lat];
  }

  resize(): void {
    this.map.resize();
  }

  // ----------------------------------------------------------- internals --

  private source(id: string): maplibregl.GeoJSONSource | undefined {
    return this.map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  }

  private fit(box: BBox, instant: boolean): void {
    const wide = this.map.getContainer().clientWidth > 700;
    this.map.fitBounds(
      [
        [box[0], box[1]],
        [box[2], box[3]],
      ],
      { padding: wide ? { top: 70, bottom: 70, left: 70, right: 70 } : 36, maxZoom: 16, duration: instant ? 0 : 900 },
    );
  }

  private placeEndpoints(line: LngLat[]): void {
    for (const m of this.markers) m.remove();
    const make = (p: LngLat, letter: 'A' | 'B') =>
      new maplibregl.Marker({ element: h('div', { class: `endpoint endpoint-${letter.toLowerCase()}`, 'aria-hidden': 'true' }, letter) })
        .setLngLat(p)
        .addTo(this.map);
    this.markers = [make(line[0]!, 'A'), make(line[line.length - 1]!, 'B')];
  }

  /** (Re)adds our sources and layers; runs on first load and after every theme switch. */
  private installLayers(): void {
    const flock = cssColor('--flock');
    const other = cssColor('--other');
    const passed = cssColor('--passed');
    const route = cssColor('--route');
    const routeAlt = cssColor('--route-alt');
    const surface = cssColor('--surface');
    const ink = cssColor('--ink');
    const dark = this.theme === 'dark';

    const images: Array<[string, string, number]> = [
      ['cone-flock', flock, dark ? 0.5 : 0.42],
      ['cone-other', other, dark ? 0.5 : 0.42],
      ['cone-passed', passed, 0.4],
      ['cone-bg-flock', flock, dark ? 0.26 : 0.2],
      ['cone-bg-other', other, dark ? 0.26 : 0.2],
    ];
    for (const [name, color, alpha] of images) {
      if (this.map.hasImage(name)) this.map.removeImage(name);
      this.map.addImage(name, coneImage(color, alpha), { pixelRatio: 2 });
    }

    const sources: Record<string, FeatureCollection> = {
      overview: this.overview,
      cams: empty(),
      cones: empty(),
      routes: empty(),
      'route-cams': empty(),
      focus: empty(),
    };
    for (const [id, data] of Object.entries(sources)) {
      if (!this.map.getSource(id)) this.map.addSource(id, { type: 'geojson', data });
    }

    // Data that should sit under the base map's labels goes before the first label layer.
    const firstLabel = this.map.getStyle().layers.find((l) => l.type === 'symbol')?.id;

    this.map.addLayer(
      {
        id: 'overview-heat',
        type: 'heatmap',
        source: 'overview',
        maxzoom: CAMERA_ZOOM + 0.6,
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'n'], 0, 0, 30, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 2, 0.7, 9, 2.2],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 2, 3, 5, 8, 8, 16, 10, 24],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(255,74,61,0)',
            0.12,
            dark ? 'rgba(255,74,61,0.28)' : 'rgba(212,42,29,0.22)',
            0.4,
            dark ? 'rgba(255,74,61,0.6)' : 'rgba(212,42,29,0.5)',
            0.75,
            dark ? 'rgba(255,128,64,0.85)' : 'rgba(225,80,30,0.75)',
            1,
            dark ? 'rgba(255,214,140,0.95)' : 'rgba(240,140,40,0.9)',
          ],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], CAMERA_ZOOM - 1, 0.95, CAMERA_ZOOM + 0.5, 0],
        },
      },
      firstLabel,
    );

    this.map.addLayer(
      {
        id: 'cams-dot',
        type: 'circle',
        source: 'cams',
        minzoom: CAMERA_ZOOM,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], CAMERA_ZOOM, 1.8, 12, 3, 15, 4.5, 18, 6.5],
          'circle-color': ['case', ['==', ['get', 'flock'], 1], flock, other],
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], CAMERA_ZOOM, 0, CAMERA_ZOOM + 0.6, 0.5, 14, 0.65],
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12, 0, 15, 1],
          'circle-stroke-color': surface,
          'circle-stroke-opacity': 0.6,
        },
      },
      firstLabel,
    );

    this.map.addLayer({
      id: 'cones',
      type: 'symbol',
      source: 'cones',
      minzoom: 13.5,
      layout: {
        'icon-image': ['concat', 'cone-', ['get', 'kind']],
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        // A direction marker more than a measurement: about 60 m of road at street zooms, never too small to see.
        'icon-size': ['interpolate', ['exponential', 1.7], ['zoom'], 13.5, 20 / CONE_LEN, 16, 46 / CONE_LEN, 18, 110 / CONE_LEN, 20, 260 / CONE_LEN],
      },
      paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 14.5, 1] },
    });

    this.map.addLayer({
      id: 'route-alt',
      type: 'line',
      source: 'routes',
      filter: ['==', ['get', 'selected'], 0],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': routeAlt,
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 3, 14, 6],
        'line-opacity': 0.85,
      },
    });
    this.map.addLayer({
      id: 'route-casing',
      type: 'line',
      source: 'routes',
      filter: ['==', ['get', 'selected'], 1],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': dark ? '#04070b' : '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 6, 14, 11] },
    });
    this.map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'routes',
      filter: ['==', ['get', 'selected'], 1],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': route, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 3.5, 14, 6.5] },
    });

    this.map.addLayer({
      id: 'route-cams-glow',
      type: 'circle',
      source: 'route-cams',
      filter: ['!=', ['get', 'kind'], 'passed'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 7, 12, 12, 16, 18],
        'circle-color': ['match', ['get', 'kind'], 'flock', flock, other],
        'circle-opacity': dark ? 0.28 : 0.2,
        'circle-blur': 0.6,
      },
    });
    this.map.addLayer({
      id: 'route-cams-dot',
      type: 'circle',
      source: 'route-cams',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 3.5, 12, 5.5, 16, 8],
        'circle-color': ['match', ['get', 'kind'], 'flock', flock, 'other', other, surface],
        'circle-stroke-width': ['match', ['get', 'kind'], 'passed', 2.5, 2],
        'circle-stroke-color': ['match', ['get', 'kind'], 'passed', passed, surface],
      },
    });
    this.map.addLayer({
      id: 'focus-ring',
      type: 'circle',
      source: 'focus',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 10, 16, 15],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-width': 3,
        'circle-stroke-color': ink,
      },
    });

    this.refreshCams();
    this.refreshRoute();
    if (this.focusId !== null) {
      const cam = this.routeCams.get(this.focusId) ?? this.viewport.get(this.focusId);
      if (cam) this.focus(cam);
    }
  }

  private async loadViewport(): Promise<void> {
    const seq = ++this.loadSeq;
    if (this.map.getZoom() < CAMERA_ZOOM - 0.25) {
      if (this.viewport.size) {
        this.viewport.clear();
        this.refreshCams();
      }
      return;
    }
    const b = this.map.getBounds();
    const box: BBox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    if (tilesForBBox(box).length > MAX_TILES) return;
    try {
      const cams = await camerasInBBox(box);
      if (seq !== this.loadSeq) return;
      this.viewport = new Map(cams.map((c) => [c.id, c]));
      this.refreshCams();
    } catch (err) {
      console.warn('Could not load cameras for this view', err);
    }
  }

  private refreshCams(): void {
    const features: Array<Feature<Point>> = [];
    for (const c of this.viewport.values()) {
      if (this.routeCams.has(c.id)) continue;
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [c.lon, c.lat] }, properties: { id: c.id, flock: c.flock ? 1 : 0 } });
    }
    this.source('cams')?.setData({ type: 'FeatureCollection', features });
    this.refreshCones();
  }

  private visibleSightings(): Array<{ s: Sighting; kind: Kind; n: number }> {
    if (!this.display) return [];
    const out: Array<{ s: Sighting; kind: Kind; n: number }> = [];
    this.display.seen.forEach((s, i) => {
      if (s.along <= this.drawn) out.push({ s, kind: s.camera.flock ? 'flock' : 'other', n: i + 1 });
    });
    if (this.drawn === Infinity) for (const s of this.display.passedBy) out.push({ s, kind: 'passed', n: 0 });
    return out;
  }

  private refreshRoute(): void {
    const d = this.display;
    const routes: Array<Feature<LineString>> = [];
    if (d) {
      d.routes.forEach((r, i) => {
        const selected = i === d.selected;
        const coords = selected && this.drawn !== Infinity ? sliceLine(r.line, this.drawn) : r.line;
        if (coords.length < 2) return;
        routes.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { index: i, selected: selected ? 1 : 0 } });
      });
      // The selected route is drawn last so it sits on top.
      routes.sort((a, b) => (a.properties!.selected as number) - (b.properties!.selected as number));
    }
    this.source('routes')?.setData({ type: 'FeatureCollection', features: routes });
    this.source('route-cams')?.setData({
      type: 'FeatureCollection',
      features: this.visibleSightings()
        // Counted cameras on top of uncounted ones.
        .sort((a, b) => Number(a.kind !== 'passed') - Number(b.kind !== 'passed'))
        .map(({ s, kind, n }) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [s.camera.lon, s.camera.lat] },
          properties: { id: s.camera.id, kind, n },
        })),
    });
    this.refreshCones();
  }

  private refreshCones(): void {
    const features: Array<Feature<Point>> = [];
    const add = (c: Camera, kind: string) => {
      for (const cone of parseDirection(c.direction)) {
        if (cone.half >= 180) continue;
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [c.lon, c.lat] }, properties: { bearing: cone.center, kind } });
      }
    };
    if (this.map.getZoom() >= 13.5) {
      for (const c of this.viewport.values()) if (!this.routeCams.has(c.id)) add(c, c.flock ? 'bg-flock' : 'bg-other');
    }
    for (const { s, kind } of this.visibleSightings()) add(s.camera, kind);
    this.source('cones')?.setData({ type: 'FeatureCollection', features });
  }

  private cameraAt(point: Pt): Camera | null {
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [
      [point.x - 7, point.y - 7],
      [point.x + 7, point.y + 7],
    ];
    for (const layer of ['route-cams-dot', 'cams-dot']) {
      if (!this.map.getLayer(layer)) continue;
      const hit = this.map.queryRenderedFeatures(box, { layers: [layer] })[0];
      const id = hit?.properties?.id as number | undefined;
      if (id !== undefined) return this.routeCams.get(id) ?? this.viewport.get(id) ?? null;
    }
    return null;
  }

  private routeAt(point: Pt): number | null {
    if (!this.map.getLayer('route-alt')) return null;
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [
      [point.x - 6, point.y - 6],
      [point.x + 6, point.y + 6],
    ];
    const hit = this.map.queryRenderedFeatures(box, { layers: ['route-alt'] })[0];
    const index = hit?.properties?.index as number | undefined;
    return index ?? null;
  }

  private onPointer(point: Pt): void {
    const cam = this.cameraAt(point);
    const overRoute = !cam && this.routeAt(point) !== null;
    this.map.getCanvas().style.cursor = cam || overRoute ? 'pointer' : '';
    this.events.hover(cam, point);
  }

  private onClick(point: Pt): void {
    const cam = this.cameraAt(point);
    if (cam) return this.events.select(cam, point);
    const route = this.routeAt(point);
    if (route !== null) return this.events.chooseRoute(route);
    this.events.select(null, point);
  }
}

const cumCache = new WeakMap<LngLat[], number[]>();

/** The first `meters` of a line, ending exactly at that distance. */
function sliceLine(line: LngLat[], meters: number): LngLat[] {
  let cum = cumCache.get(line);
  if (!cum) cumCache.set(line, (cum = cumulativeDistances(line)));
  if (meters <= 0) return [line[0]!];
  let i = 1;
  while (i < line.length && cum[i]! < meters) i++;
  if (i >= line.length) return line;
  const t = (meters - cum[i - 1]!) / (cum[i]! - cum[i - 1]! || 1);
  return [...line.slice(0, i), lerp(line[i - 1]!, line[i]!, t)];
}
