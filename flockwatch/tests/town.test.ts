import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Camera } from '../src/lib/camera';
import type { LngLat } from '../src/lib/geo';
import { decodeTown, encodeTown } from '../src/lib/share';
import { camerasInTown, inOutline, inRings, outlineBBox, pickFeature, spreadSample, type Outline, type TigerResponse } from '../src/lib/town';

const camera = (id: number, lon: number, lat: number): Camera => ({ id, lon, lat, brand: '', flock: true, direction: '', operator: '' });

// A 10 x 10 square with a 4 x 4 hole in the middle, like a city around an unincorporated pocket.
const square: LngLat[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
  [0, 0],
];
const hole: LngLat[] = [
  [3, 3],
  [7, 3],
  [7, 7],
  [3, 7],
  [3, 3],
];

describe('inRings', () => {
  it('finds points inside and outside a polygon', () => {
    expect(inRings([5, 5], [square])).toBe(true);
    expect(inRings([0.1, 9.9], [square])).toBe(true);
    expect(inRings([-1, 5], [square])).toBe(false);
    expect(inRings([11, 5], [square])).toBe(false);
    expect(inRings([5, 10.5], [square])).toBe(false);
  });

  it('leaves out a hole', () => {
    expect(inRings([5, 5], [square, hole])).toBe(false);
    expect(inRings([1, 1], [square, hole])).toBe(true);
    expect(inRings([8, 5], [square, hole])).toBe(true);
  });

  it('handles a concave shape', () => {
    // An L: the notch at the top right is outside.
    const l: LngLat[] = [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10],
      [0, 0],
    ];
    expect(inRings([2, 8], [l])).toBe(true);
    expect(inRings([8, 2], [l])).toBe(true);
    expect(inRings([8, 8], [l])).toBe(false);
  });
});

describe('inOutline', () => {
  it('counts a point in any part of a city made of several pieces', () => {
    const far: LngLat[] = square.map(([x, y]) => [x + 20, y]);
    const outline: Outline = { type: 'MultiPolygon', coordinates: [[square, hole], [far]] };
    expect(inOutline([25, 5], outline)).toBe(true);
    expect(inOutline([1, 1], outline)).toBe(true);
    expect(inOutline([5, 5], outline)).toBe(false);
    expect(inOutline([15, 5], outline)).toBe(false);
    expect(outlineBBox(outline)).toEqual([0, 0, 30, 10]);
  });
});

describe('a real town: Decatur, Georgia', () => {
  const json = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/tiger-decatur-ga.json'), 'utf8')) as TigerResponse;
  const found = pickFeature(json, 'Decatur')!;
  const town = { outline: found.outline, bbox: outlineBBox(found.outline) };

  it('reads the Census answer', () => {
    expect(found.censusName).toBe('Decatur city');
    expect(found.outline.type).toBe('Polygon');
  });

  it('keeps cameras inside the city limits and drops the ones outside', () => {
    const inside = [
      camera(1, -84.2963, 33.7748), // the square downtown
      camera(2, -84.2958, 33.7711), // the Census's point for the city
    ];
    const outside = [
      camera(3, -84.388, 33.749), // downtown Atlanta
      camera(4, -84.3195, 33.7738), // Druid Hills, just west of the city line
      camera(5, -84.2963, 33.6), // inside the box's longitude, far to the south
    ];
    expect(camerasInTown([...inside, ...outside], town).map((c) => c.id)).toEqual([1, 2]);
  });
});

describe('pickFeature', () => {
  const feature = (name: string, basename: string) => ({
    geometry: { type: 'Polygon' as const, coordinates: [square] },
    properties: { NAME: name, BASENAME: basename },
  });

  it('prefers the place whose name matches', () => {
    const json = { features: [feature('Avondale Estates city', 'Avondale Estates'), feature('Decatur city', 'Decatur')] };
    expect(pickFeature(json, 'Decatur')?.censusName).toBe('Decatur city');
    expect(pickFeature(json, 'Somewhere else')?.censusName).toBe('Avondale Estates city');
  });

  it('returns null when the Census has no place there', () => {
    expect(pickFeature({ features: [] }, 'Decatur')).toBeNull();
    expect(pickFeature({ features: [{ geometry: null, properties: null }] }, 'Decatur')).toBeNull();
    expect(pickFeature({}, 'Decatur')).toBeNull();
  });
});

describe('spreadSample', () => {
  it('keeps everything when there are few enough', () => {
    const few = [camera(1, 0, 1), camera(2, 0, 2)];
    expect(spreadSample(few, 5)).toEqual(few);
  });

  it('takes cameras from all over, not just the first ones', () => {
    const many = Array.from({ length: 100 }, (_, i) => camera(i, 0, i));
    const picked = spreadSample(many, 10);
    expect(picked).toHaveLength(10);
    expect(picked[0]!.lat).toBe(0);
    expect(picked[9]!.lat).toBe(90);
    expect(new Set(picked.map((c) => c.id)).size).toBe(10);
  });
});

describe('town share links', () => {
  it('round-trips a town as readable text', () => {
    const hash = encodeTown('Decatur', 'GA');
    expect(hash).toBe('#town=Decatur,+GA');
    expect(decodeTown(hash)).toBe('Decatur, GA');
    expect(decodeTown(encodeTown('Coeur d’Alene', 'ID'))).toBe('Coeur d’Alene, ID');
    expect(decodeTown(encodeTown('Winston-Salem', 'NC'))).toBe('Winston-Salem, NC');
  });

  it('ignores links without a town', () => {
    expect(decodeTown('#from=33.749,-84.388&to=33.641,-84.428')).toBeNull();
    expect(decodeTown('#town=')).toBeNull();
    expect(decodeTown('')).toBeNull();
  });
});
