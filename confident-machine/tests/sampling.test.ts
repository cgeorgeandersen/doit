import { describe, expect, it } from 'vitest';
import { applyTemperature, effectiveChoices, entropyBits, nucleus, sampleIndex, topK } from '../src/engine/sampling';
import { mulberry32, normal, seedFromString } from '../src/engine/rng';
import { sum } from './helpers';

describe('entropy', () => {
  it('is log2(n) bits for n equally likely options and 0 for a certainty', () => {
    expect(entropyBits(Float64Array.from([0.25, 0.25, 0.25, 0.25]))).toBeCloseTo(2, 12);
    expect(effectiveChoices(Float64Array.from([0.25, 0.25, 0.25, 0.25]))).toBeCloseTo(4, 12);
    expect(entropyBits(Float64Array.from([1, 0, 0]))).toBe(0);
  });
});

describe('temperature on a known distribution', () => {
  const p = Float64Array.from([0.6, 0.3, 0.1]);

  it('T = 1 leaves probabilities unchanged', () => {
    expect([...applyTemperature(p, 1)]).toEqual([0.6, 0.3, 0.1].map((x) => expect.closeTo(x, 12)));
  });

  it('T = 0.5 squares and renormalizes (0.36 : 0.09 : 0.01)', () => {
    const out = applyTemperature(p, 0.5);
    expect(out[0]).toBeCloseTo(0.36 / 0.46, 12);
    expect(out[2]).toBeCloseTo(0.01 / 0.46, 12);
  });

  it('very high temperature approaches uniform', () => {
    const out = applyTemperature(p, 1000);
    for (const x of out) expect(x).toBeCloseTo(1 / 3, 2);
    expect(sum(out)).toBeCloseTo(1, 12);
  });
});

describe('sampling', () => {
  it('draws options about as often as their probability', () => {
    const rng = mulberry32(1);
    const p = Float64Array.from([0.5, 0.3, 0.2]);
    const tally = [0, 0, 0];
    const n = 20000;
    for (let i = 0; i < n; i += 1) tally[sampleIndex(p, rng)]! += 1;
    expect(tally[0]! / n).toBeCloseTo(0.5, 1);
    expect(tally[1]! / n).toBeCloseTo(0.3, 1);
    expect(tally[2]! / n).toBeCloseTo(0.2, 1);
  });

  it('never picks an impossible option', () => {
    const rng = mulberry32(9);
    const p = Float64Array.from([0, 1, 0]);
    for (let i = 0; i < 1000; i += 1) expect(sampleIndex(p, rng)).toBe(1);
  });

  it('ranks the top options highest first', () => {
    expect(topK(Float64Array.from([0.1, 0.4, 0.2, 0.3]), 2).map((r) => r.index)).toEqual([1, 3]);
  });
});

describe('nucleus (top-p) truncation', () => {
  it('keeps the smallest set of top options covering p, and renormalizes', () => {
    const out = nucleus(Float64Array.from([0.5, 0.3, 0.15, 0.05]), 0.75);
    expect([...out].map((x) => +x.toFixed(6))).toEqual([0.625, 0.375, 0, 0]);
    expect(sum(out)).toBeCloseTo(1, 12);
  });

  it('is a no-op at p = 1', () => {
    expect([...nucleus(Float64Array.from([0.2, 0.8]), 1)]).toEqual([0.2, 0.8]);
  });
});

describe('seeded randomness', () => {
  it('repeats exactly for the same seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 100; i += 1) expect(a()).toBe(b());
  });

  it('produces standard normal draws with the right mean and spread', () => {
    const rng = mulberry32(5);
    const xs = Array.from({ length: 20000 }, () => normal(rng));
    const mean = sum(xs) / xs.length;
    const sd = Math.sqrt(sum(xs.map((x) => (x - mean) ** 2)) / xs.length);
    expect(mean).toBeCloseTo(0, 1);
    expect(sd).toBeCloseTo(1, 1);
  });

  it('hashes strings to stable seeds', () => {
    expect(seedFromString('the queen')).toBe(seedFromString('the queen'));
    expect(seedFromString('the queen')).not.toBe(seedFromString('the king'));
  });
});
