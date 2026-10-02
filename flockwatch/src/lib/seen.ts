/**
 * Which cameras would photograph a car driving a route.
 *
 * A plate reader on a pole watches one stretch of road: it reads the back of a
 * car driving away from it, or the front of one driving toward it. So a camera
 * counts when the route passes through the part of the road it is aimed at,
 * traveling roughly along its line of sight. Driving past a camera that points
 * at a side street, a parking lot or the other side of a divided highway does
 * not count.
 *
 * The rules are deliberately simple so they can be explained on the page (see
 * "How we count" in index.html). Their numbers live in COUNT_RULES.
 */

import type { Camera } from './camera';
import { parseDirection } from './direction';
import {
  angleDiff,
  bboxOf,
  cumulativeDistances,
  densify,
  localProjection,
  padBBox,
  pointToSegment,
  vectorBearing,
  type LngLat,
} from './geo';

export const COUNT_RULES = {
  /** Cameras farther than this from the route line are not considered at all. */
  corridorM: 60,
  /** How far down the road we assume a camera can capture a vehicle (about 200 ft). */
  viewRangeM: 60,
  /** With no direction recorded, a camera counts only if it is this close to the route. */
  unknownDirectionM: 30,
  /** A car counts as driving toward or away from a camera within this many degrees of its line of sight. */
  axisToleranceDeg: 50,
  /** Spacing of the points along the route tested against each camera's view. */
  sampleStepM: 4,
};

export type CountRules = typeof COUNT_RULES;

/**
 * - rear: you drive away from the camera through its view, so it sees the back of your car.
 * - front: you drive toward it, so it sees the front.
 * - both: the route passes it both ways.
 * - all-around: it is tagged as seeing in every direction.
 * - close-unknown: no direction recorded, but it stands right beside the route.
 * - facing-away: near the route, but aimed at a different road.
 * - far-unknown: near the route, no direction recorded, and not close enough to be sure.
 */
export type Verdict = 'rear' | 'front' | 'both' | 'all-around' | 'close-unknown' | 'facing-away' | 'far-unknown';

export interface Sighting {
  camera: Camera;
  verdict: Verdict;
  /** Meters from the start of the route to the point closest to the camera. */
  along: number;
  /** Meters between the camera and the route at that point. */
  offset: number;
}

export interface RouteCount {
  /** Cameras that would photograph the car, in route order. */
  seen: Sighting[];
  /** Cameras near the route that we don't count, in route order. */
  passedBy: Sighting[];
}

export function isCounted(verdict: Verdict): boolean {
  return verdict !== 'facing-away' && verdict !== 'far-unknown';
}

/** Grid cell size for the route index, in degrees (about 200 m). */
const CELL = 0.002;
const cellKey = (lat: number, lon: number) => Math.floor(lat / CELL) * 1_000_000 + Math.floor(lon / CELL);

interface LocalSegment {
  ax: number;
  ay: number;
  dx: number;
  dy: number;
  len: number;
}

export function countAlongRoute(
  line: readonly LngLat[],
  cameras: Iterable<Camera>,
  rules: CountRules = COUNT_RULES,
): RouteCount {
  const seen: Sighting[] = [];
  const passedBy: Sighting[] = [];
  if (line.length < 2) return { seen, passedBy };

  // Short segments keep each one in a handful of grid cells.
  const route = densify(line, 100);
  const cum = cumulativeDistances(route);
  const reach = Math.max(rules.corridorM, rules.viewRangeM);

  // Index every segment under each grid cell within `reach` of it.
  const grid = new Map<number, number[]>();
  for (let s = 0; s < route.length - 1; s++) {
    const [w, south, e, n] = padBBox(bboxOf([route[s]!, route[s + 1]!]), reach);
    for (let i = Math.floor(south / CELL); i <= Math.floor(n / CELL); i++) {
      for (let j = Math.floor(w / CELL); j <= Math.floor(e / CELL); j++) {
        const key = i * 1_000_000 + j;
        const list = grid.get(key);
        if (!list) grid.set(key, [s]);
        else if (list[list.length - 1] !== s) list.push(s);
      }
    }
  }

  for (const camera of cameras) {
    const segments = grid.get(cellKey(camera.lat, camera.lon));
    if (!segments) continue;

    // Work in meters around the camera, which sits at (0, 0).
    const project = localProjection([camera.lon, camera.lat]);
    let offset = Infinity;
    let along = 0;
    const nearby: LocalSegment[] = [];
    for (const s of segments) {
      const [ax, ay] = project(route[s]!);
      const [bx, by] = project(route[s + 1]!);
      const { dist, t } = pointToSegment(0, 0, ax, ay, bx, by);
      if (dist < offset) {
        offset = dist;
        along = cum[s]! + t * (cum[s + 1]! - cum[s]!);
      }
      if (dist <= rules.viewRangeM) {
        const dx = bx - ax;
        const dy = by - ay;
        nearby.push({ ax, ay, dx, dy, len: Math.hypot(dx, dy) });
      }
    }
    if (offset > rules.corridorM) continue;

    const verdict = judge(camera, offset, nearby, rules);
    (isCounted(verdict) ? seen : passedBy).push({ camera, verdict, along, offset });
  }

  const byAlong = (a: Sighting, b: Sighting) => a.along - b.along;
  return { seen: seen.sort(byAlong), passedBy: passedBy.sort(byAlong) };
}

function judge(camera: Camera, offset: number, nearby: LocalSegment[], rules: CountRules): Verdict {
  const cones = parseDirection(camera.direction);
  if (cones.length === 0) return offset <= rules.unknownDirectionM ? 'close-unknown' : 'far-unknown';
  if (cones.some((c) => c.half >= 180)) return 'all-around';

  let rear = false;
  let front = false;
  for (const { ax, ay, dx, dy, len } of nearby) {
    if (len === 0) continue;
    // The part of this segment inside the camera's range: where the line
    // through it crosses a circle of radius viewRangeM around the camera.
    const foot = -(ax * dx + ay * dy) / (len * len);
    const perpendicular = Math.abs(ax * dy - ay * dx) / len;
    if (perpendicular > rules.viewRangeM) continue;
    const halfChord = Math.sqrt(rules.viewRangeM ** 2 - perpendicular ** 2) / len;
    const t0 = Math.max(0, foot - halfChord);
    const t1 = Math.min(1, foot + halfChord);
    if (t0 > t1) continue;

    const heading = vectorBearing(dx, dy);
    const steps = Math.max(1, Math.ceil(((t1 - t0) * len) / rules.sampleStepM));
    for (let k = 0; k <= steps; k++) {
      const t = t0 + ((t1 - t0) * k) / steps;
      const x = ax + dx * t;
      const y = ay + dy * t;
      // Right at the pole the bearing is meaningless; the next sample decides.
      if (Math.hypot(x, y) < 1) continue;
      const toPoint = vectorBearing(x, y);
      for (const cone of cones) {
        if (angleDiff(toPoint, cone.center) > cone.half) continue;
        if (angleDiff(heading, cone.center) <= rules.axisToleranceDeg) rear = true;
        else if (angleDiff(heading, cone.center + 180) <= rules.axisToleranceDeg) front = true;
      }
    }
    if (rear && front) break;
  }
  if (rear && front) return 'both';
  if (rear) return 'rear';
  if (front) return 'front';
  return 'facing-away';
}

/** One plain sentence about how a camera sees a car on this route. */
export function describeVerdict(verdict: Verdict): string {
  switch (verdict) {
    case 'rear':
      return 'You drive away from it through its view, so it photographs the back of your car and your rear plate.';
    case 'front':
      return 'You drive toward it, so it photographs the front of your car (and your front plate, if your state requires one).';
    case 'both':
      return 'It sees your car coming and going: the front as you approach and the back as you drive away.';
    case 'all-around':
      return 'It is recorded as seeing in every direction, so it sees your car whichever way you pass.';
    case 'close-unknown':
      return 'It stands right beside your route. Its direction isn’t recorded, so we assume it sees your car.';
    case 'facing-away':
      return 'It is near your route but aimed at a different road, so we don’t count it.';
    case 'far-unknown':
      return 'It is near your route, but its direction isn’t recorded and it isn’t close enough to be sure, so we don’t count it.';
  }
}
