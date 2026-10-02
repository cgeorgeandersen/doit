import { describe, expect, it } from 'vitest';
import { decodeTile, type CameraTile } from '../src/lib/camera';
import { normalizeBrand, normalizeOperator, parseCsv, tileKey } from '../src/lib/normalize';

describe('normalizeBrand', () => {
  it('folds the spellings found in the data into one name', () => {
    expect(normalizeBrand('Flock Safety')).toBe('Flock Safety');
    expect(normalizeBrand('Flock Group Inc.')).toBe('Flock Safety');
    expect(normalizeBrand('Flock')).toBe('Flock Safety');
    expect(normalizeBrand('Axis communications')).toBe('Axis Communications');
    expect(normalizeBrand('AXIS')).toBe('Axis Communications');
    expect(normalizeBrand('Vigilant Solutions')).toBe('Motorola Solutions');
    expect(normalizeBrand('Axon Enterprise')).toBe('Axon');
    expect(normalizeBrand('PlateSmart/CyclopsTchnlgs')).toBe('PlateSmart');
  });

  it('keeps unknown manufacturers as written and blanks missing ones', () => {
    expect(normalizeBrand('  Acme Optics ')).toBe('Acme Optics');
    expect(normalizeBrand('')).toBe('');
    expect(normalizeBrand(undefined)).toBe('');
  });
});

describe('normalizeOperator', () => {
  it('treats the vendor as an unknown operator', () => {
    expect(normalizeOperator('Flock Safety')).toBe('');
    expect(normalizeOperator('Flock Group Inc')).toBe('');
  });

  it('tidies whitespace and keeps real operators', () => {
    expect(normalizeOperator('  Atlanta   Police Department ')).toBe('Atlanta Police Department');
    expect(normalizeOperator("Lowe's")).toBe("Lowe's");
    expect(normalizeOperator(null)).toBe('');
  });
});

describe('parseCsv', () => {
  it('handles quoted commas, escaped quotes, line breaks inside quotes and CRLF', () => {
    const csv = 'name,address,note\r\n"Doe, Jane","1 Main St\nSuite 2","She said ""hi"""\r\nRoe,,plain\n';
    expect(parseCsv(csv)).toEqual([
      { name: 'Doe, Jane', address: '1 Main St\nSuite 2', note: 'She said "hi"' },
      { name: 'Roe', address: '', note: 'plain' },
    ]);
  });

  it('copes with a missing final newline and blank lines', () => {
    expect(parseCsv('a,b\n\n1,2')).toEqual([{ a: '1', b: '2' }]);
    expect(parseCsv('')).toEqual([]);
  });
});

describe('tiles', () => {
  it('names 1° tiles by their south-west corner', () => {
    expect(tileKey(-84.39, 33.75)).toBe('33_-85');
    expect(tileKey(2.35, 48.85)).toBe('48_2');
    expect(tileKey(-84, 33)).toBe('33_-84');
  });

  it('decodes a compact tile into cameras', () => {
    const tile: CameraTile = {
      v: 1,
      brands: ['', 'Flock Safety', 'Genetec'],
      ops: ['', 'Atlanta Police Department'],
      cams: [
        [101, -84.38, 33.75, 1, 1, '135'],
        [102, -84.37, 33.76, 2, 0, ''],
        [103, -84.36, 33.77, 0, 0, '90'],
      ],
    };
    expect(decodeTile(tile)).toEqual([
      { id: 101, lon: -84.38, lat: 33.75, brand: 'Flock Safety', flock: true, direction: '135', operator: 'Atlanta Police Department' },
      { id: 102, lon: -84.37, lat: 33.76, brand: 'Genetec', flock: false, direction: '', operator: '' },
      { id: 103, lon: -84.36, lat: 33.77, brand: '', flock: false, direction: '90', operator: '' },
    ]);
  });
});
