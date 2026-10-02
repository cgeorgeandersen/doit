import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { unzipSingle } from '../scripts/unzip';
import type { LngLat } from '../src/lib/geo';
import { foldText, highlightRanges, placeKey, placeName } from '../src/lib/normalize';
import { decodePlaces, matchPlaces } from '../src/lib/places';

describe('foldText', () => {
  it('reduces text to plain lowercase words', () => {
    expect(foldText('San José')).toBe('san jose');
    expect(foldText('St. Louis')).toBe('st louis');
    expect(foldText('Winston-Salem')).toBe('winston salem');
    expect(foldText('Utqiaġvik')).toBe('utqiagvik');
    expect(foldText('ʻEwa Beach')).toBe('ewa beach');
    expect(foldText('  Atlanta,  GA ')).toBe('atlanta ga');
  });
});

describe('highlightRanges', () => {
  it('marks typed words where words start, ignoring case and accents', () => {
    expect(highlightRanges('Lenox Square', 'lenox sq')).toEqual([
      [0, 5],
      [6, 8],
    ]);
    expect(highlightRanges('Cañon City', 'canon')).toEqual([[0, 5]]);
    expect(highlightRanges('1600 Pennsylvania Avenue', '1600 penn')).toEqual([
      [0, 4],
      [5, 9],
    ]);
  });

  it('does not mark matches in the middle of a word', () => {
    expect(highlightRanges('Atlanta', 'lan')).toEqual([]);
    expect(highlightRanges('San Buenaventura (Ventura)', 'ventura')).toEqual([[18, 25]]);
  });
});

describe('Census place names', () => {
  it('drops the legal type the way people say the name', () => {
    expect(placeName('Abbeville city')).toBe('Abbeville');
    expect(placeName('Oak Park village')).toBe('Oak Park');
    expect(placeName('Paradise CDP')).toBe('Paradise');
    expect(placeName('Indianapolis city (balance)')).toBe('Indianapolis');
    expect(placeName('Nashville-Davidson metropolitan government (balance)')).toBe('Nashville-Davidson');
    expect(placeName('Louisville/Jefferson County metro government (balance)')).toBe('Louisville/Jefferson County');
    expect(placeName('Salt Lake City city')).toBe('Salt Lake City');
    expect(placeName('Carson City')).toBe('Carson City');
    expect(placeName('San Buenaventura (Ventura) city')).toBe('San Buenaventura (Ventura)');
  });

  it('files each name under its first letter', () => {
    expect(placeKey('Atlanta')).toBe('a');
    expect(placeKey('Ñiñe')).toBe('n');
    expect(placeKey('ʻEwa Beach')).toBe('e');
  });
});

describe('matchPlaces', () => {
  const index = decodePlaces({
    v: 1,
    places: [
      ['New York', 'NY', -73.94, 40.66, 8_478_072],
      ['York', 'PA', -76.73, 39.96, 44_000],
      ['Yorktown', 'TX', -97.5, 28.98, 2_000],
      ['Springfield', 'MO', -93.29, 37.19, 170_000],
      ['Springfield', 'IL', -89.65, 39.78, 113_000],
      ['Springfield', 'VT', -72.48, 43.3, 9_000],
      ['Atlanta', 'GA', -84.42, 33.76, 520_070],
      ['Atlantic City', 'NJ', -74.45, 39.38, 38_000],
      ['Atlanta', 'TX', -94.16, 33.11, 5_400],
      ['San Buenaventura (Ventura)', 'CA', -119.25, 34.27, 110_000],
      ['Cañon City', 'CO', -105.22, 38.44, 17_193],
      ['Marietta', 'GA', -84.55, 33.95, 61_000],
      ['Marion', 'IN', -85.66, 40.55, 28_000],
      ['Marion', 'OH', -83.13, 40.59, 35_000],
      ['Metairie', 'LA', -90.17, 30.0, 0],
    ],
  });
  const names = (q: string, near?: LngLat) => matchPlaces(index, q, near).map((p) => `${p.name}, ${p.state}`);

  it('suggests places from the first few letters, biggest first', () => {
    expect(names('atl')).toEqual(['Atlanta, GA', 'Atlantic City, NJ', 'Atlanta, TX']);
    expect(names('spring')).toEqual(['Springfield, MO', 'Springfield, IL', 'Springfield, VT']);
  });

  it('ranks a big city reached by a later word above a small exact match', () => {
    expect(names('york')[0]).toBe('New York, NY');
    expect(names('york')).toContain('York, PA');
  });

  it('narrows by a state written after the name, even half-typed', () => {
    expect(names('springfield il')).toEqual(['Springfield, IL']);
    expect(names('springfield, illinois')).toEqual(['Springfield, IL']);
    expect(names('atlanta, t')).toEqual(['Atlanta, TX']);
    expect(names('atlanta g')).toEqual(['Atlanta, GA']);
  });

  it('keeps names that only look like they end in a state', () => {
    expect(names('new york')).toEqual(['New York, NY']);
  });

  it('matches alternate names, accents and unincorporated places', () => {
    expect(names('ventura')).toEqual(['San Buenaventura (Ventura), CA']);
    expect(names('canon c')).toEqual(['Cañon City, CO']);
    expect(names('metai')).toEqual(['Metairie, LA']);
  });

  it('leans toward the other end of the route', () => {
    expect(names('mari')[0]).toBe('Marietta, GA');
    expect(names('mari', [-83.13, 40.59])[0]).toBe('Marion, OH');
  });

  it('needs two letters', () => {
    expect(names('a')).toEqual([]);
  });
});

describe('unzipSingle', () => {
  const fixture = (name: string) => readFileSync(resolve(import.meta.dirname, `fixtures/${name}`));
  const expected = 'GA\t1304000\tAtlanta city\t33.762909\t-84.422675\nCO\t0811810\tCañon City city';

  it('reads a deflated archive', () => {
    expect(unzipSingle(fixture('places-deflated.zip')).toString('utf8')).toContain(expected);
  });

  it('reads a stored archive', () => {
    expect(unzipSingle(fixture('places-stored.zip')).toString('utf8')).toContain(expected);
  });

  it('refuses something that isn’t a zip', () => {
    expect(() => unzipSingle(Buffer.from('not a zip file at all, just text'))).toThrow('Not a zip archive');
  });
});
