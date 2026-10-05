/**
 * The assessment's scoring rules (src/assessment/scoring.ts): stage
 * thresholds, the weakest-link rule, and how gaps are chosen and ordered.
 * Run with `npm test` (Node's own test runner; no extra packages).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ASSESSMENT } from '../src/assessment/content.ts';
import { isComplete, questionCount, score, stageIndexFor } from '../src/assessment/scoring.ts';

/** The real model: six dimensions of three questions, four stages, the weakest-link rule on. */
const MODEL = { dimensions: ASSESSMENT.dimensions, stages: ASSESSMENT.stages, rules: ASSESSMENT.rules };

const STAGES = [
  { id: 'magic', name: 'Magic', minAverage: 0, definition: '', next: '' },
  { id: 'alchemy', name: 'Alchemy', minAverage: 0.75, definition: '', next: '' },
  { id: 'chemistry', name: 'Chemistry', minAverage: 1.5, definition: '', next: '' },
  { id: 'boring', name: 'Boring', minAverage: 2.25, definition: '', next: '' },
];

/** A small synthetic model, so these tests don't depend on the wording in content.ts. */
function model(dimensionSizes, rules = { weakestLinkCap: 1, gapCount: 3 }) {
  const dimensions = dimensionSizes.map((size, d) => ({
    id: `d${d}`,
    name: `Dimension ${d}`,
    asks: '',
    framework: 'calibrated-trust',
    questions: Array.from({ length: size }, (_, q) => ({ id: `d${d}q${q}`, prompt: `Q${q}`, options: ['0', '1', '2', '3'], nextStep: `step d${d}q${q}` })),
  }));
  return { dimensions, stages: STAGES, rules };
}

/** dims([3,3,3], [0,1,2]) → [3,3,3,0,1,2] */
const dims = (...groups) => groups.flat();
const repeat = (value, n) => Array.from({ length: n }, () => value);
const stageName = (index) => STAGES[index].name;
const ids = (list) => list.map((d) => d.dimension.id);

describe('the real model', () => {
  it('has 18 questions', () => {
    assert.equal(questionCount(MODEL), 18);
  });

  it('scores all zeros as Magic and all threes as Boring', () => {
    assert.equal(score(repeat(0, 18), MODEL).stageIndex, 0);
    assert.equal(score(repeat(3, 18), MODEL).stageIndex, 3);
  });

  it('adds up points and the average', () => {
    const result = score(repeat(2, 18), MODEL);
    assert.equal(result.points, 36);
    assert.equal(result.max, 54);
    assert.equal(result.average, 2);
    assert.deepEqual(result.dimensions.map((d) => d.points), repeat(6, 6));
    assert.ok(result.dimensions.every((d) => d.max === 9));
  });
});

describe('stageIndexFor', () => {
  it('uses the last stage whose minimum the average reaches', () => {
    const cases = [[0, 0], [0.74, 0], [0.75, 1], [1.49, 1], [1.5, 2], [2.2499, 2], [2.25, 3], [3, 3]];
    for (const [average, stage] of cases) assert.equal(stageIndexFor(average, STAGES), stage, `average ${average}`);
  });

  it("doesn't let floating-point error push an exact boundary down", () => {
    assert.equal(stageIndexFor(0.45 + 0.2 + 0.1, STAGES), 1);
    assert.equal(stageIndexFor(27 / 18, STAGES), 2);
  });

  it('maps a dimension of three answers onto the stages as documented: 0–2, 3–4, 5–6, 7–9', () => {
    const stageOfPoints = (points) => stageIndexFor(points / 3, STAGES);
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(stageOfPoints), [0, 0, 0, 1, 1, 2, 2, 3, 3, 3]);
  });

  it('maps the total of 18 answers as documented: 0–13, 14–26, 27–40, 41–54', () => {
    const stageOfTotal = (total) => stageIndexFor(total / 18, STAGES);
    assert.deepEqual([13, 14, 26, 27, 40, 41].map(stageOfTotal), [0, 1, 1, 2, 2, 3]);
  });
});

describe('the weakest-link rule', () => {
  const m = model([3, 3, 3, 3, 3, 3]);

  it('holds the stage to one above the weakest dimension', () => {
    // Five perfect dimensions and one at zero: the average (2.5) alone is Boring.
    const result = score(dims([3, 3, 3], [3, 3, 3], [3, 3, 3], [0, 0, 0], [3, 3, 3], [3, 3, 3]), m);
    assert.equal(stageName(result.averageStageIndex), 'Boring');
    assert.equal(stageName(result.stageIndex), 'Alchemy');
    assert.equal(result.cappedBy?.dimension.id, 'd3');
  });

  it('leaves the stage alone when the weakest dimension is close enough', () => {
    const result = score(dims([3, 3, 3], [3, 3, 3], [2, 2, 1], [3, 3, 3], [3, 3, 3], [3, 3, 3]), m);
    assert.equal(stageName(result.stageIndex), 'Boring');
    assert.equal(result.cappedBy, null);
  });

  it('names the dimension most in need when several hold it down', () => {
    // d1 and d3 are both Magic with 2 points and a zero each, so the order asked decides.
    assert.equal(score(dims([3, 3, 3], [1, 1, 0], [3, 3, 3], [0, 1, 1], [3, 3, 3], [3, 3, 3]), m).cappedBy?.dimension.id, 'd1');
    // With fewer points, d3 is the one most in need.
    assert.equal(score(dims([3, 3, 3], [1, 1, 0], [3, 3, 3], [0, 0, 1], [3, 3, 3], [3, 3, 3]), m).cappedBy?.dimension.id, 'd3');
  });

  it('can be turned off, or widened', () => {
    const answers = dims([3, 3, 3], [3, 3, 3], [3, 3, 3], [0, 0, 0], [3, 3, 3], [3, 3, 3]);
    const off = score(answers, model([3, 3, 3, 3, 3, 3], { weakestLinkCap: null, gapCount: 3 }));
    assert.equal(stageName(off.stageIndex), 'Boring');
    assert.equal(off.cappedBy, null);
    const wide = score(answers, model([3, 3, 3, 3, 3, 3], { weakestLinkCap: 2, gapCount: 3 }));
    assert.equal(stageName(wide.stageIndex), 'Chemistry');
  });

  it('never raises a stage', () => {
    const result = score(repeat(0, 18), m);
    assert.equal(result.stageIndex, 0);
    assert.equal(result.cappedBy, null);
  });
});

describe('gaps', () => {
  const m = model([3, 3, 3, 3, 3, 3]);

  it('lists the three lowest dimensions, lowest first', () => {
    const result = score(dims([3, 3, 3], [1, 1, 1], [2, 2, 2], [0, 0, 0], [3, 3, 2], [2, 1, 1]), m);
    assert.deepEqual(ids(result.gaps), ['d3', 'd1', 'd5']);
  });

  it('breaks a tie by the lowest single answer, then by the order asked', () => {
    // d0, d1 and d2 all have 6 points; d1 hides a zero, so it comes first.
    const result = score(dims([2, 2, 2], [3, 3, 0], [2, 2, 2], [3, 3, 3], [3, 3, 3], [3, 3, 3]), m);
    assert.deepEqual(ids(result.gaps), ['d1', 'd0', 'd2']);
  });

  it('takes the next step from the lowest answer in the dimension, the first on a tie', () => {
    const result = score(dims([3, 1, 2], [2, 1, 1], [0, 3, 3], [3, 3, 3], [3, 3, 3], [3, 3, 3]), m);
    const steps = Object.fromEntries(result.gaps.map((g) => [g.dimension.id, g.weakest.question.id]));
    assert.deepEqual(steps, { d0: 'd0q1', d1: 'd1q1', d2: 'd2q0' });
    assert.equal(result.gaps.find((g) => g.dimension.id === 'd2')?.weakest.answer, 0);
  });

  it('skips dimensions with full marks, so it can show fewer than three, or none', () => {
    assert.deepEqual(ids(score(dims([3, 3, 3], [3, 3, 2], [3, 3, 3], [3, 3, 3], [3, 2, 3], [3, 3, 3]), m).gaps), ['d1', 'd4']);
    assert.deepEqual(score(repeat(3, 18), m).gaps, []);
  });

  it('follows gapCount', () => {
    assert.deepEqual(ids(score(repeat(1, 18), model([3, 3, 3, 3, 3, 3], { weakestLinkCap: 1, gapCount: 1 })).gaps), ['d0']);
  });

  it('compares dimensions of different sizes by their average', () => {
    // d0: 4 of 6 (average 2); d1: 5 of 9 (average 1.67) is further from done.
    assert.deepEqual(ids(score(dims([2, 2], [2, 2, 1]), model([2, 3])).gaps), ['d1', 'd0']);
  });
});

describe('answers', () => {
  it('knows a complete set from an incomplete one', () => {
    assert.equal(isComplete(repeat(1, 18), MODEL), true);
    for (const bad of [repeat(1, 17), [...repeat(1, 17), 4], [...repeat(1, 17), 1.5], [...repeat(1, 17), -1], [...repeat(1, 17), null]]) {
      assert.equal(isComplete(bad, MODEL), false, JSON.stringify(bad));
    }
  });

  it('refuses to score an incomplete set', () => {
    assert.throws(() => score(repeat(1, 17), MODEL), /18 answers/);
  });
});
