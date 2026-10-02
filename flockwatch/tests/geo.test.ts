import { describe, expect, it } from 'vitest';
import {
  angleDiff,
  bearing,
  bboxOf,
  cumulativeDistances,
  densify,
  haversine,
  normalizeBearing,
  offsetPoint,
  padBBox,
  pointToSegment,
  type LngLat,
} from '../src/lib/geo';

const ATL: LngLat = [-84.388, 33.749];

describe('distances and bearings', () => {
  it('measures a degree of latitude as about 111.2 km', () => {
    expect(haversine([0, 0], [0, 1])).toBeCloseTo(111_195, -1);
  });

  it('round-trips offsetPoint through haversine and bearing', () => {
    for (const b of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const p = offsetPoint(ATL, b, 250);
      expect(haversine(ATL, p)).toBeCloseTo(250, 0);
      expect(angleDiff(bearing(ATL, p), b)).toBeLessThan(0.1);
    }
  });

  it('normalizes bearings into [0, 360)', () => {
    expect(normalizeBearing(-30)).toBe(330);
    expect(normalizeBearing(360)).toBe(0);
    expect(normalizeBearing(725)).toBe(5);
    expect(Object.is(normalizeBearing(-0), 0)).toBe(true);
    expect(normalizeBearing(-1e-15)).toBeLessThan(360);
  });

  it('takes the short way round for angle differences', () => {
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(10, 350)).toBe(20);
    expect(angleDiff(0, 180)).toBe(180);
    expect(angleDiff(90, 450)).toBe(0);
  });
});

describe('segments and lines', () => {
  it('finds the closest point on a segment, clamped to its ends', () => {
    expect(pointToSegment(0, 5, -10, 0, 10, 0)).toEqual({ dist: 5, t: 0.5 });
    expect(pointToSegment(20, 0, -10, 0, 10, 0)).toEqual({ dist: 10, t: 1 });
    expect(pointToSegment(3, 4, 0, 0, 0, 0)).toEqual({ dist: 5, t: 0 });
  });

  it('accumulates distance along a line', () => {
    const line = [ATL, offsetPoint(ATL, 0, 100), offsetPoint(ATL, 0, 300)];
    const cum = cumulativeDistances(line);
    expect(cum[0]).toBe(0);
    expect(cum[1]).toBeCloseTo(100, 0);
    expect(cum[2]).toBeCloseTo(300, 0);
  });

  it('densifies without moving the original vertices', () => {
    const end = offsetPoint(ATL, 90, 1000);
    const dense = densify([ATL, end], 100);
    expect(dense).toHaveLength(11);
    expect(dense[0]).toEqual(ATL);
    expect(dense[10]).toEqual(end);
    for (let i = 1; i < dense.length; i++) expect(haversine(dense[i - 1]!, dense[i]!)).toBeLessThanOrEqual(100.01);
  });

  it('pads a bounding box by real distance', () => {
    const box = padBBox(bboxOf([ATL]), 1000);
    expect(haversine([box[0], ATL[1]], ATL)).toBeCloseTo(1000, -1);
    expect(haversine([ATL[0], box[3]], ATL)).toBeCloseTo(1000, -1);
  });
});
