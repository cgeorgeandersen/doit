import { expect, it } from 'vitest';
import { CASES } from '../src/core/cases';
import { career, DOCKET_SIZE, pickDocket } from '../src/core/docket';
import { rule } from '../src/core/sentence';

function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

it('picks six different cases with at least two silly and two serious, opening on a silly one', () => {
  for (let s = 1; s <= 200; s++) {
    const docket = pickDocket(CASES, new Set(), seeded(s));
    expect(docket).toHaveLength(DOCKET_SIZE);
    expect(new Set(docket.map((c) => c.id)).size).toBe(DOCKET_SIZE);
    expect(docket[0]!.tone).toBe('silly');
    expect(docket.filter((c) => c.tone === 'silly').length).toBeGreaterThanOrEqual(2);
    expect(docket.filter((c) => c.tone === 'serious').length).toBeGreaterThanOrEqual(2);
  }
});

it('never puts two serious cases back to back', () => {
  for (let s = 1; s <= 200; s++) {
    const tones = pickDocket(CASES, new Set(), seeded(s)).map((c) => c.tone);
    for (let i = 1; i < tones.length; i++) expect(tones[i] === 'serious' && tones[i - 1] === 'serious').toBe(false);
  }
});

it("shows cases the player hasn't seen before ones they have", () => {
  const first = pickDocket(CASES, new Set(), seeded(5));
  const second = pickDocket(CASES, new Set(first.map((c) => c.id)), seeded(9));
  expect(second.filter((c) => first.includes(c))).toEqual([]);
});

it('names the judge by how they ruled', () => {
  const goose = CASES.find((c) => c.id === 'prom-goose')!;
  const fair = Array.from({ length: 6 }, () => rule(goose, { kind: 'fine', amount: 250 }));
  expect(career(fair).title).toBe('Solomon With a Gavel');
  const harsh = Array.from({ length: 6 }, () => rule(goose, { kind: 'prison', years: 2 }));
  expect(career(harsh).title).toBe('The Iron Gavel');
  const absurd = Array.from({ length: 6 }, () => rule(goose, { kind: 'death' }));
  expect(career(absurd)).toMatchObject({ title: 'Overturned Again', overturned: 6 });
});
