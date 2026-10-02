import { describe, expect, it } from 'vitest';
import type { Camera } from '../src/lib/camera';
import { offsetPoint, type LngLat } from '../src/lib/geo';
import { COUNT_RULES, countAlongRoute, isCounted } from '../src/lib/seen';

// A straight road running north from a point in Atlanta.
const START: LngLat = [-84.388, 33.749];
const NORTH_END = offsetPoint(START, 0, 600);
const NORTHBOUND: LngLat[] = [START, NORTH_END];
const SOUTHBOUND: LngLat[] = [NORTH_END, START];

let nextId = 1;
/** A camera `east` meters east of the road, `north` meters up it, pointing `direction`. */
function cam(north: number, east: number, direction: string, flock = true): Camera {
  const [lon, lat] = offsetPoint(offsetPoint(START, 0, north), 90, east);
  return { id: nextId++, lon, lat, brand: flock ? 'Flock Safety' : 'Genetec', flock, direction, operator: '' };
}

const verdictOf = (route: LngLat[], camera: Camera) => {
  const { seen, passedBy } = countAlongRoute(route, [camera]);
  return [...seen, ...passedBy][0]?.verdict ?? 'ignored';
};

describe('countAlongRoute', () => {
  it('sees the back of a car driving away from a camera, and the front of one driving toward it', () => {
    const facingNorth = cam(300, 10, '0');
    expect(verdictOf(NORTHBOUND, facingNorth)).toBe('rear');
    expect(verdictOf(SOUTHBOUND, facingNorth)).toBe('front');
  });

  it('reads the travel direction against a camera pointed both ways', () => {
    expect(verdictOf(NORTHBOUND, cam(300, 10, '0;180'))).toBe('both');
  });

  it('does not count a camera aimed away from the road', () => {
    expect(verdictOf(NORTHBOUND, cam(300, 10, '90'))).toBe('facing-away');
  });

  it('does not count a camera on a cross street watching the intersection you drive through', () => {
    // 40 m east of the road, aimed west down the cross street at the intersection.
    expect(verdictOf(NORTHBOUND, cam(300, 40, '270'))).toBe('facing-away');
  });

  it('does not count a camera watching a parallel road', () => {
    expect(verdictOf(NORTHBOUND, cam(300, 55, '0'))).toBe('facing-away');
  });

  it('counts a camera aimed slightly off the road, as volunteers often record them', () => {
    expect(verdictOf(NORTHBOUND, cam(300, 15, '25'))).toBe('rear');
    expect(verdictOf(NORTHBOUND, cam(300, -15, '340'))).toBe('rear');
  });

  it('handles cameras with no recorded direction by distance', () => {
    expect(verdictOf(NORTHBOUND, cam(300, 15, ''))).toBe('close-unknown');
    expect(verdictOf(NORTHBOUND, cam(300, 45, 'forward'))).toBe('far-unknown');
  });

  it('ignores cameras outside the corridor', () => {
    expect(verdictOf(NORTHBOUND, cam(300, COUNT_RULES.corridorM + 20, '0'))).toBe('ignored');
    expect(verdictOf(NORTHBOUND, cam(1500, 5, '0'))).toBe('ignored');
  });

  it('counts an all-around camera whichever way you pass', () => {
    expect(verdictOf(NORTHBOUND, cam(300, 20, '0-360'))).toBe('all-around');
  });

  it('counts a camera at the start of a route that drives away from it', () => {
    expect(verdictOf(NORTHBOUND, cam(0, 8, '0'))).toBe('rear');
  });

  it('orders sightings along the route and reports where they are', () => {
    const near = cam(100, 10, '0');
    const far = cam(450, -12, '0');
    const { seen } = countAlongRoute(NORTHBOUND, [far, near]);
    expect(seen.map((s) => s.camera.id)).toEqual([near.id, far.id]);
    expect(seen[0]!.along).toBeCloseTo(100, -1);
    expect(seen[0]!.offset).toBeCloseTo(10, 0);
    expect(seen[1]!.along).toBeCloseTo(450, -1);
  });

  it('follows a route that turns a corner', () => {
    const corner = offsetPoint(START, 0, 300);
    const east = offsetPoint(corner, 90, 400);
    const route: LngLat[] = [START, corner, east];
    // On the eastbound leg, 10 m north of it, aimed east.
    const [lon, lat] = offsetPoint(offsetPoint(corner, 90, 200), 0, 10);
    const camera: Camera = { id: 999, lon, lat, brand: 'Flock Safety', flock: true, direction: '90', operator: '' };
    const { seen } = countAlongRoute(route, [camera]);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.verdict).toBe('rear');
    expect(seen[0]!.along).toBeCloseTo(500, -1);
  });

  it('returns nothing for a route with fewer than two points', () => {
    expect(countAlongRoute([START], [cam(0, 5, '0')])).toEqual({ seen: [], passedBy: [] });
  });

  it('keeps counted and uncounted verdicts apart', () => {
    expect(isCounted('rear')).toBe(true);
    expect(isCounted('close-unknown')).toBe(true);
    expect(isCounted('facing-away')).toBe(false);
    expect(isCounted('far-unknown')).toBe(false);
  });

  it('stays fast on a long route through a dense area', () => {
    // 50 km of zig-zag road and 40,000 cameras scattered across it.
    const route: LngLat[] = [START];
    for (let i = 1; i <= 500; i++) route.push(offsetPoint(route[i - 1]!, i % 2 ? 10 : 80, 100));
    const cameras: Camera[] = [];
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 40_000; i++) {
      const [lon, lat] = offsetPoint(START, rand() * 90, rand() * 50_000);
      cameras.push({ id: i, lon, lat, brand: '', flock: false, direction: String(Math.floor(rand() * 360)), operator: '' });
    }
    const t0 = performance.now();
    countAlongRoute(route, cameras);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
