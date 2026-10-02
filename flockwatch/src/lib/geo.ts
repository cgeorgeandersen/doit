/**
 * Small, dependency-free geometry for routes and cameras.
 *
 * Points are [longitude, latitude], the GeoJSON order. Distances are meters and
 * bearings are degrees clockwise from north. Anything local (a camera and the
 * road beside it) is measured on a flat "local projection": over a few hundred
 * meters the Earth is flat to well under a millimeter, so plain x/y geometry is
 * both simpler and exact enough.
 */

export type LngLat = [number, number];
export type BBox = [west: number, south: number, east: number, north: number];

/** Mean Earth radius in meters (IUGG). */
const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

/** Great-circle distance between two points, in meters. */
export function haversine(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Normalizes any angle in degrees to [0, 360). */
export function normalizeBearing(deg: number): number {
  const n = deg % 360;
  const r = n < 0 ? n + 360 : n;
  // `+ 0` turns -0 into 0; tiny negatives can round up to exactly 360.
  return r >= 360 ? 0 : r + 0;
}

/** The smallest difference between two bearings, in [0, 180]. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(normalizeBearing(a) - normalizeBearing(b));
  return d > 180 ? 360 - d : d;
}

/**
 * Returns a function that projects points to meters east (x) and north (y) of
 * `origin`, using an equirectangular projection centered there.
 */
export function localProjection(origin: LngLat): (p: LngLat) => [number, number] {
  const mPerDegLat = EARTH_RADIUS_M * RAD;
  const mPerDegLon = mPerDegLat * Math.cos(origin[1] * RAD);
  return (p) => [(p[0] - origin[0]) * mPerDegLon, (p[1] - origin[1]) * mPerDegLat];
}

/** Bearing of the vector (x east, y north), in [0, 360). */
export function vectorBearing(x: number, y: number): number {
  return normalizeBearing(Math.atan2(x, y) / RAD);
}

/** Initial bearing from a to b, in [0, 360). Accurate for the short hops between route points. */
export function bearing(a: LngLat, b: LngLat): number {
  const [x, y] = localProjection(a)(b);
  return vectorBearing(x, y);
}

/**
 * Distance from point (px, py) to the segment (ax, ay)–(bx, by) in the same
 * planar units, and how far along the segment (0–1) the closest point lies.
 */
export function pointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { dist: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { dist: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

/** Cumulative distance in meters at each vertex of a line; the first is 0. */
export function cumulativeDistances(line: readonly LngLat[]): number[] {
  const out = new Array<number>(line.length);
  let total = 0;
  for (let i = 0; i < line.length; i++) {
    if (i > 0) total += haversine(line[i - 1]!, line[i]!);
    out[i] = total;
  }
  return out;
}

/** The bounding box of a set of points. */
export function bboxOf(points: readonly LngLat[]): BBox {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of points) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}

/** Grows a bounding box by `meters` on every side. */
export function padBBox([w, s, e, n]: BBox, meters: number): BBox {
  const dLat = meters / (EARTH_RADIUS_M * RAD);
  const widestLat = Math.max(Math.abs(s), Math.abs(n));
  const dLon = meters / (EARTH_RADIUS_M * RAD * Math.max(0.01, Math.cos(widestLat * RAD)));
  return [w - dLon, s - dLat, e + dLon, n + dLat];
}

/** Inserts points so that no segment of the line is longer than `maxStep` meters. */
export function densify(line: readonly LngLat[], maxStep: number): LngLat[] {
  if (line.length < 2) return line.slice();
  const out: LngLat[] = [line[0]!];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const pieces = Math.ceil(haversine(a, b) / maxStep);
    for (let k = 1; k < pieces; k++) {
      const t = k / pieces;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    out.push(b);
  }
  return out;
}

/** Point at `t` (0–1) along the segment a–b. */
export function lerp(a: LngLat, b: LngLat, t: number): LngLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Destination point from `origin` after traveling `meters` on `bearingDeg` (flat approximation). */
export function offsetPoint(origin: LngLat, bearingDeg: number, meters: number): LngLat {
  const mPerDegLat = EARTH_RADIUS_M * RAD;
  const mPerDegLon = mPerDegLat * Math.cos(origin[1] * RAD);
  const b = bearingDeg * RAD;
  return [origin[0] + (Math.sin(b) * meters) / mPerDegLon, origin[1] + (Math.cos(b) * meters) / mPerDegLat];
}
