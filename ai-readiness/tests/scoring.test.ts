import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import type { Dimension, ScoringModel, Stage } from '../src/lib/model';
import { isComplete, questionCount, score, stageIndexFor } from '../src/lib/scoring';

/** The real model: six dimensions of three questions, four stages, the weakest-link rule on. */
const MODEL: ScoringModel = { dimensions: CONTENT.dimensions, stages: CONTENT.stages, rules: CONTENT.rules };

const STAGES: Stage[] = [
  { id: 'magic', name: 'Magic', minAverage: 0, definition: '', next: '' },
  { id: 'alchemy', name: 'Alchemy', minAverage: 0.75, definition: '', next: '' },
  { id: 'chemistry', name: 'Chemistry', minAverage: 1.5, definition: '', next: '' },
  { id: 'boring', name: 'Boring', minAverage: 2.25, definition: '', next: '' },
];

/** A small synthetic model, so tests don't depend on the wording in content.ts. */
function model(dimensionSizes: number[], rules: ScoringModel['rules'] = { weakestLinkCap: 1, gapCount: 3 }): ScoringModel {
  const dimensions: Dimension[] = dimensionSizes.map((size, d) => ({
    id: `d${d}`,
    name: `Dimension ${d}`,
    asks: '',
    framework: 'calibrated-trust',
    questions: Array.from({ length: size }, (_, q) => ({ id: `d${d}q${q}`, prompt: `Q${q}`, options: ['0', '1', '2', '3'], nextStep: `step d${d}q${q}` })),
  }));
  return { dimensions, stages: STAGES, rules };
}

/** Six answers per dimension list, e.g. dims([3,3,3], [0,1,2]) → [3,3,3,0,1,2]. */
const dims = (...groups: number[][]) => groups.flat();
const repeat = (value: number, n: number) => Array.from({ length: n }, () => value);
const stageName = (index: number) => STAGES[index]!.name;

describe('the real model', () => {
  it('has 18 questions', () => {
    expect(questionCount(MODEL)).toBe(18);
  });

  it('scores all zeros as Magic and all threes as Boring', () => {
    expect(score(repeat(0, 18), MODEL).stageIndex).toBe(0);
    expect(score(repeat(3, 18), MODEL).stageIndex).toBe(3);
  });

  it('adds up points and the average', () => {
    const result = score(repeat(2, 18), MODEL);
    expect(result.points).toBe(36);
    expect(result.max).toBe(54);
    expect(result.average).toBe(2);
    expect(result.dimensions.map((d) => d.points)).toEqual(repeat(6, 6));
    expect(result.dimensions.every((d) => d.max === 9)).toBe(true);
  });
});

describe('stageIndexFor', () => {
  it('uses the last stage whose minimum the average reaches', () => {
    expect(stageIndexFor(0, STAGES)).toBe(0);
    expect(stageIndexFor(0.74, STAGES)).toBe(0);
    expect(stageIndexFor(0.75, STAGES)).toBe(1);
    expect(stageIndexFor(1.49, STAGES)).toBe(1);
    expect(stageIndexFor(1.5, STAGES)).toBe(2);
    expect(stageIndexFor(2.2499, STAGES)).toBe(2);
    expect(stageIndexFor(2.25, STAGES)).toBe(3);
    expect(stageIndexFor(3, STAGES)).toBe(3);
  });

  it("doesn't let floating-point error push an exact boundary down", () => {
    // 0.1 + 0.2 + 0.45 is 0.7500000000000001 or 0.7499999999999999 depending on order.
    expect(stageIndexFor(0.45 + 0.2 + 0.1, STAGES)).toBe(1);
    expect(stageIndexFor(27 / 18, STAGES)).toBe(2);
  });

  it('maps a dimension of three answers onto the stages as documented: 0–2, 3–4, 5–6, 7–9', () => {
    const stageOfPoints = (points: number) => stageIndexFor(points / 3, STAGES);
    expect([0, 1, 2].map(stageOfPoints)).toEqual([0, 0, 0]);
    expect([3, 4].map(stageOfPoints)).toEqual([1, 1]);
    expect([5, 6].map(stageOfPoints)).toEqual([2, 2]);
    expect([7, 8, 9].map(stageOfPoints)).toEqual([3, 3, 3]);
  });

  it('maps the overall total of 18 answers as documented: 0–13, 14–26, 27–40, 41–54', () => {
    const stageOfTotal = (total: number) => stageIndexFor(total / 18, STAGES);
    expect(stageOfTotal(13)).toBe(0);
    expect(stageOfTotal(14)).toBe(1);
    expect(stageOfTotal(26)).toBe(1);
    expect(stageOfTotal(27)).toBe(2);
    expect(stageOfTotal(40)).toBe(2);
    expect(stageOfTotal(41)).toBe(3);
  });
});

describe('the weakest-link rule', () => {
  const m = model([3, 3, 3, 3, 3, 3]);

  it('holds the stage to one above the weakest dimension', () => {
    // Five perfect dimensions and one at zero: the average (2.5) alone is Boring.
    const result = score(dims([3, 3, 3], [3, 3, 3], [3, 3, 3], [0, 0, 0], [3, 3, 3], [3, 3, 3]), m);
    expect(stageName(result.averageStageIndex)).toBe('Boring');
    expect(stageName(result.stageIndex)).toBe('Alchemy');
    expect(result.cappedBy?.dimension.id).toBe('d3');
  });

  it('leaves the stage alone when the weakest dimension is close enough', () => {
    // Weakest dimension at Chemistry (5 points); Boring is one step above it.
    const result = score(dims([3, 3, 3], [3, 3, 3], [2, 2, 1], [3, 3, 3], [3, 3, 3], [3, 3, 3]), m);
    expect(stageName(result.stageIndex)).toBe('Boring');
    expect(result.cappedBy).toBeNull();
  });

  it('names the dimension most in need when several hold it down', () => {
    // d1 and d3 are both Magic with 2 points and a zero each, so the order asked decides.
    const tie = score(dims([3, 3, 3], [1, 1, 0], [3, 3, 3], [0, 1, 1], [3, 3, 3], [3, 3, 3]), m);
    expect(tie.cappedBy?.dimension.id).toBe('d1');
    // With fewer points, d3 is the one most in need.
    const lower = score(dims([3, 3, 3], [1, 1, 0], [3, 3, 3], [0, 0, 1], [3, 3, 3], [3, 3, 3]), m);
    expect(lower.cappedBy?.dimension.id).toBe('d3');
  });

  it('can be turned off', () => {
    const off = model([3, 3, 3, 3, 3, 3], { weakestLinkCap: null, gapCount: 3 });
    const result = score(dims([3, 3, 3], [3, 3, 3], [3, 3, 3], [0, 0, 0], [3, 3, 3], [3, 3, 3]), off);
    expect(stageName(result.stageIndex)).toBe('Boring');
    expect(result.cappedBy).toBeNull();
  });

  it('allows a wider cap', () => {
    const wide = model([3, 3, 3, 3, 3, 3], { weakestLinkCap: 2, gapCount: 3 });
    const result = score(dims([3, 3, 3], [3, 3, 3], [3, 3, 3], [0, 0, 0], [3, 3, 3], [3, 3, 3]), wide);
    expect(stageName(result.stageIndex)).toBe('Chemistry');
  });

  it('never raises a stage', () => {
    const result = score(repeat(0, 18), m);
    expect(result.stageIndex).toBe(0);
    expect(result.cappedBy).toBeNull();
  });
});

describe('gaps', () => {
  const m = model([3, 3, 3, 3, 3, 3]);

  it('lists the three lowest dimensions, lowest first', () => {
    const result = score(dims([3, 3, 3], [1, 1, 1], [2, 2, 2], [0, 0, 0], [3, 3, 2], [2, 1, 1]), m);
    expect(result.gaps.map((g) => g.dimension.id)).toEqual(['d3', 'd1', 'd5']);
  });

  it('breaks a tie by the lowest single answer, then by the order asked', () => {
    // d0, d1 and d2 all have 6 points; d1 hides a zero, so it comes first.
    const result = score(dims([2, 2, 2], [3, 3, 0], [2, 2, 2], [3, 3, 3], [3, 3, 3], [3, 3, 3]), m);
    expect(result.gaps.map((g) => g.dimension.id)).toEqual(['d1', 'd0', 'd2']);
  });

  it('takes the next step from the lowest answer in the dimension, the first on a tie', () => {
    const result = score(dims([3, 1, 2], [2, 1, 1], [0, 3, 3], [3, 3, 3], [3, 3, 3], [3, 3, 3]), m);
    const steps = Object.fromEntries(result.gaps.map((g) => [g.dimension.id, g.weakest.question.id]));
    expect(steps).toEqual({ d0: 'd0q1', d1: 'd1q1', d2: 'd2q0' });
    expect(result.gaps.find((g) => g.dimension.id === 'd2')?.weakest.answer).toBe(0);
  });

  it('skips dimensions with full marks, so it can show fewer than three', () => {
    const result = score(dims([3, 3, 3], [3, 3, 2], [3, 3, 3], [3, 3, 3], [3, 2, 3], [3, 3, 3]), m);
    expect(result.gaps.map((g) => g.dimension.id)).toEqual(['d1', 'd4']);
  });

  it('is empty when everything scores full marks', () => {
    expect(score(repeat(3, 18), m).gaps).toEqual([]);
  });

  it('follows gapCount', () => {
    const one = model([3, 3, 3, 3, 3, 3], { weakestLinkCap: 1, gapCount: 1 });
    expect(score(repeat(1, 18), one).gaps.map((g) => g.dimension.id)).toEqual(['d0']);
  });

  it('compares dimensions of different sizes by their average', () => {
    // d0: 4 of 6 (average 2); d1: 5 of 9 (average 1.67) is further from done.
    const mixed = model([2, 3]);
    const result = score(dims([2, 2], [2, 2, 1]), mixed);
    expect(result.gaps.map((g) => g.dimension.id)).toEqual(['d1', 'd0']);
  });
});

describe('answers', () => {
  it('knows a complete set from an incomplete one', () => {
    expect(isComplete(repeat(1, 18), MODEL)).toBe(true);
    expect(isComplete(repeat(1, 17), MODEL)).toBe(false);
    expect(isComplete([...repeat(1, 17), 4], MODEL)).toBe(false);
    expect(isComplete([...repeat(1, 17), 1.5], MODEL)).toBe(false);
    expect(isComplete([...repeat(1, 17), -1], MODEL)).toBe(false);
    expect(isComplete([...repeat(1, 17), null], MODEL)).toBe(false);
  });

  it('refuses to score an incomplete set', () => {
    expect(() => score(repeat(1, 17), MODEL)).toThrow(/18 answers/);
  });
});
