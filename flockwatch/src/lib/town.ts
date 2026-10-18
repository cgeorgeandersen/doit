/**
 * A town's outline from the Census Bureau, and the cameras inside it.
 *
 * TIGERweb holds the official boundary of every incorporated place (city,
 * town, village, borough) and every Census-designated place (an
 * unincorporated community). We ask it which place contains the town's
 * Census point, which is always inside the place, so no name matching is
 * needed. The request goes through this site's /api/boundary/ for the same
 * reasons as the Census Geocoder: the visitor's browser only talks to us, and
 * Vercel caches each outline.
 */

import type { Geometry, MultiPolygon, Polygon } from 'geojson';
import type { Camera } from './camera';
import { bboxOf, type BBox, type LngLat } from './geo';
import { foldText } from './normalize';

const BOUNDARY_URL = '/api/boundary';
/** TIGERweb's current layers for incorporated places and Census-designated places, checked in that order. */
const INCORPORATED = 4;
const LAYERS = [INCORPORATED, 5];
/** Outlines are simplified to about 10 m, which keeps Houston near 200 KB without moving a camera across a border it isn't near. */
const SIMPLIFY_DEG = 0.0001;

export type Outline = Polygon | MultiPolygon;

export interface Town {
  name: string;
  state: string;
  /** The Census's own name, e.g. "Decatur city" or "Dunn Loring CDP". */
  censusName: string;
  /** False for a Census-designated place: unincorporated land, governed by its county. */
  incorporated: boolean;
  outline: Outline;
  bbox: BBox;
}

export interface TigerResponse {
  features?: Array<{ geometry: Geometry | null; properties: { NAME?: string; BASENAME?: string } | null }>;
  error?: { message?: string };
}

/** The place in a TIGERweb answer, preferring one whose name matches the town's. */
export function pickFeature(json: TigerResponse, name: string): { censusName: string; outline: Outline } | null {
  const usable = (json.features ?? []).filter(
    (f): f is { geometry: Outline; properties: { NAME?: string; BASENAME?: string } } =>
      f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon',
  );
  const wanted = foldText(name);
  const best = usable.find((f) => foldText(f.properties?.BASENAME ?? '') === wanted) ?? usable[0];
  return best ? { censusName: best.properties?.NAME ?? name, outline: best.geometry } : null;
}

function rings(outline: Outline): LngLat[][][] {
  return (outline.type === 'Polygon' ? [outline.coordinates] : outline.coordinates) as LngLat[][][];
}

export function outlineBBox(outline: Outline): BBox {
  // A polygon's outer rings hold every point that matters for its box.
  return bboxOf(rings(outline).flatMap((polygon) => polygon[0] ?? []));
}

/**
 * Whether `p` is inside a polygon given as rings (the outer edge, then any
 * holes). Casts a ray east from the point and counts the edges it crosses:
 * an odd count means inside. Holes need no special case, since crossing
 * into a hole and back out again adds two.
 */
export function inRings(p: LngLat, polygon: readonly LngLat[][]): boolean {
  const [x, y] = p;
  let inside = false;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      // The edge straddles the ray's height, and meets it east of the point.
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export function inOutline(p: LngLat, outline: Outline): boolean {
  return rings(outline).some((polygon) => inRings(p, polygon));
}

/** The cameras inside a town, checking its bounding box first because that's cheap. */
export function camerasInTown(cameras: readonly Camera[], town: Pick<Town, 'outline' | 'bbox'>): Camera[] {
  const [w, s, e, n] = town.bbox;
  return cameras.filter((c) => c.lon >= w && c.lon <= e && c.lat >= s && c.lat <= n && inOutline([c.lon, c.lat], town.outline));
}

/**
 * Up to `max` cameras spread across the town, for looking up who answers for
 * them: legislative districts split big cities, so the first `max` in a list
 * could all sit in one corner.
 */
export function spreadSample<T extends { lon: number; lat: number }>(cameras: readonly T[], max: number): T[] {
  if (cameras.length <= max) return [...cameras];
  const sorted = [...cameras].sort((a, b) => a.lat - b.lat || a.lon - b.lon);
  return Array.from({ length: max }, (_, i) => sorted[Math.floor((i * sorted.length) / max)]!);
}

function query(layer: number, p: LngLat): Promise<TigerResponse> {
  const params = new URLSearchParams({
    geometry: `${p[0]},${p[1]}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'NAME,BASENAME',
    returnGeometry: 'true',
    outSR: '4326',
    maxAllowableOffset: String(SIMPLIFY_DEG),
    geometryPrecision: '5',
    f: 'geojson',
  });
  return fetch(`${BOUNDARY_URL}/${layer}/query?${params}`).then((r) => {
    if (!r.ok) throw new Error(`Census boundaries: ${r.status}`);
    return r.json() as Promise<TigerResponse>;
  });
}

/** The outline of the town whose Census point is `at`, or null if the Census has none there. */
export async function loadTown(name: string, state: string, at: LngLat): Promise<Town | null> {
  const answers = await Promise.all(LAYERS.map((layer) => query(layer, at)));
  for (const [i, json] of answers.entries()) {
    if (json.error) throw new Error(`Census boundaries: ${json.error.message ?? 'error'}`);
    const found = pickFeature(json, name);
    if (found) return { name, state, ...found, incorporated: LAYERS[i] === INCORPORATED, bbox: outlineBBox(found.outline) };
  }
  return null;
}
