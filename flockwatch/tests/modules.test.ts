import { describe, expect, it } from 'vitest';
import { fmtDuration, fmtMiles, spacing } from '../src/lib/format';
import { nearbyPlace, toPlaces, type PhotonResponse } from '../src/lib/geocode';
import { offsetPoint, type LngLat } from '../src/lib/geo';
import { NoRouteError, parseOsrm } from '../src/lib/route';
import { decodeRoute, encodeRoute } from '../src/lib/share';
import { tilesForBBox, tilesForRoute } from '../src/lib/tiles';

describe('share links', () => {
  it('round-trips a route, rounded to about 100 m', () => {
    const hash = encodeRoute([-84.388123, 33.749456], [-84.427712, 33.640734]);
    expect(hash).toBe('#from=33.749,-84.388&to=33.641,-84.428');
    expect(decodeRoute(hash)).toEqual({ from: [-84.388, 33.749], to: [-84.428, 33.641] });
  });

  it('rejects malformed or out-of-range points', () => {
    expect(decodeRoute('#from=33.7,-84.3')).toBeNull();
    expect(decodeRoute('#from=abc,1&to=1,2')).toBeNull();
    expect(decodeRoute('#from=95,0&to=1,2')).toBeNull();
    expect(decodeRoute('')).toBeNull();
  });
});

describe('formatting', () => {
  it('writes distances in miles, or feet when short', () => {
    expect(fmtMiles(29_000)).toBe('18 mi');
    expect(fmtMiles(5_000)).toBe('3.1 mi');
    expect(fmtMiles(100)).toBe('328 ft');
  });

  it('writes durations in minutes and hours', () => {
    expect(fmtDuration(20)).toBe('1 min');
    expect(fmtDuration(1800)).toBe('30 min');
    expect(fmtDuration(3600)).toBe('1 hr');
    expect(fmtDuration(5400)).toBe('1 hr 30 min');
  });

  it('describes how often cameras come up', () => {
    expect(spacing(16_093, 10)).toBe('about one every 1.0 miles');
    expect(spacing(1_000, 10)).toBe('about one every 350 feet');
    expect(spacing(1_000, 0)).toBeNull();
  });
});

describe('parseOsrm', () => {
  it('returns each route with its line, distance and time', () => {
    const routes = parseOsrm({
      code: 'Ok',
      routes: [
        { distance: 1200, duration: 180, geometry: { coordinates: [[-84.39, 33.75], [-84.38, 33.76]] } },
        { distance: 1500, duration: 200, geometry: { coordinates: [[-84.39, 33.75], [-84.37, 33.76]] } },
      ],
    });
    expect(routes).toHaveLength(2);
    expect(routes[0]).toEqual({ line: [[-84.39, 33.75], [-84.38, 33.76]], distance: 1200, duration: 180 });
  });

  it('explains when no road connects two places', () => {
    expect(() => parseOsrm({ code: 'NoRoute' })).toThrow(NoRouteError);
    expect(() => parseOsrm({ code: 'InvalidQuery', message: 'Bad input' })).toThrow('Bad input');
  });
});

describe('toPlaces', () => {
  const feature = (properties: Record<string, string>, coordinates: [number, number] = [-77.0365, 38.8977]) => ({
    geometry: { coordinates },
    properties,
  });

  it('keeps U.S. results and writes a two-line label', () => {
    const json: PhotonResponse = {
      features: [
        feature({ countrycode: 'US', name: 'White House', housenumber: '1600', street: 'Pennsylvania Avenue Northwest', city: 'Washington', state: 'District of Columbia', postcode: '20500' }),
        feature({ countrycode: 'US', housenumber: '10', street: 'Main Street', city: 'Smallville', state: 'Kansas', postcode: '66002' }, [-95, 39]),
        feature({ countrycode: 'FR', name: 'Paris', state: 'Île-de-France' }, [2.35, 48.85]),
        feature({ countrycode: 'US', name: 'Paris', state: 'Texas' }, [-95.55, 33.66]),
      ],
    };
    expect(toPlaces(json)).toEqual([
      { label: 'White House', detail: '1600 Pennsylvania Avenue Northwest, Washington, DC 20500', lon: -77.0365, lat: 38.8977 },
      { label: '10 Main Street', detail: 'Smallville, KS 66002', lon: -95, lat: 39 },
      { label: 'Paris', detail: 'TX', lon: -95.55, lat: 33.66 },
    ]);
  });

  it('drops duplicates and nameless results', () => {
    const json: PhotonResponse = {
      features: [
        feature({ countrycode: 'US', name: 'Union Station', city: 'Denver', state: 'Colorado' }),
        feature({ countrycode: 'US', name: 'Union Station', city: 'Denver', state: 'Colorado' }),
        feature({ countrycode: 'US' }),
      ],
    };
    expect(toPlaces(json)).toHaveLength(1);
  });
});

describe('nearbyPlace', () => {
  it('labels a point by its street, not the nearest shop, and keeps the point', () => {
    const json: PhotonResponse = {
      features: [
        { geometry: { coordinates: [-84.3651, 33.7724] }, properties: { countrycode: 'US', name: 'ELVN Essentials', housenumber: '675', street: 'Ponce de Leon Avenue Northeast', city: 'Atlanta', state: 'Georgia' } },
      ],
    };
    expect(nearbyPlace(json, -84.365, 33.772)).toEqual({
      label: 'Near 675 Ponce de Leon Avenue Northeast',
      detail: 'Atlanta, GA',
      lon: -84.365,
      lat: 33.772,
    });
  });

  it('falls back to a named place, and to nothing outside the U.S.', () => {
    const park: PhotonResponse = { features: [{ geometry: { coordinates: [-105, 40] }, properties: { countrycode: 'US', name: 'Rocky Mountain Arsenal', state: 'Colorado' } }] };
    expect(nearbyPlace(park, -105, 40)?.label).toBe('Near Rocky Mountain Arsenal');
    const abroad: PhotonResponse = { features: [{ geometry: { coordinates: [2, 48] }, properties: { countrycode: 'FR', street: 'Rue de Rivoli' } }] };
    expect(nearbyPlace(abroad, 2, 48)).toBeNull();
  });
});

describe('tiles', () => {
  it('lists the 1° tiles a box touches', () => {
    expect(tilesForBBox([-84.5, 33.5, -83.5, 34.2])).toEqual(['33_-85', '33_-84', '34_-85', '34_-84']);
  });

  it('loads only the tiles a diagonal route passes through, not its whole box', () => {
    const start: LngLat = [-84.9, 33.1];
    const line: LngLat[] = [start, offsetPoint(start, 45, 400_000)];
    const route = tilesForRoute(line, 60);
    const box = tilesForBBox([line[0]![0], line[0]![1], line[1]![0], line[1]![1]]);
    expect(route.length).toBeLessThan(box.length);
    for (const key of route) expect(box).toContain(key);
    expect(route).toContain('33_-85');
  });

  it('includes a neighboring tile when the route runs right beside its edge', () => {
    // A road 30 m south of the 34° line: cameras just north of it sit in the next tile.
    const line: LngLat[] = [[-84.6, 33.99973], [-84.4, 33.99973]];
    expect(tilesForRoute(line, 60).sort()).toEqual(['33_-85', '34_-85']);
  });
});
