import { describe, expect, it } from 'vitest';
import { auc, logLoss, predictProbability, sigmoid, trainLogistic } from '../src/engine/logistic';
import { mulberry32, normal } from '../src/engine/rng';

describe('sigmoid', () => {
  it('maps scores to probabilities', () => {
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(40)).toBeCloseTo(1, 12);
    expect(sigmoid(-40)).toBeCloseTo(0, 12);
    expect(Number.isFinite(sigmoid(-1000))).toBe(true);
  });
});

describe('logistic regression', () => {
  // Simulate data from a known rule: logit = 1.5·x1 − 1.0·x2 + 0·x3
  const rng = mulberry32(11);
  const rows: number[][] = [];
  const labels: number[] = [];
  for (let i = 0; i < 4000; i += 1) {
    const x = [normal(rng), normal(rng), normal(rng)];
    rows.push(x);
    labels.push(rng() < sigmoid(1.5 * x[0]! - 1.0 * x[1]!) ? 1 : 0);
  }
  const model = trainLogistic(['x1', 'x2', 'x3'], rows, labels, { iterations: 1500 });

  it('recovers the true weights (features already have sd ≈ 1)', () => {
    expect(model.weights[0]).toBeCloseTo(1.5, 0);
    expect(model.weights[1]).toBeCloseTo(-1.0, 0);
    expect(Math.abs(model.weights[2]!)).toBeLessThan(0.15);
  });

  it('beats a coin flip by a wide margin', () => {
    expect(logLoss(model, rows, labels)).toBeLessThan(Math.log(2) - 0.15);
    expect(predictProbability(model, [2, -2, 0])).toBeGreaterThan(0.9);
  });

  it('is deterministic', () => {
    expect(trainLogistic(['x1', 'x2', 'x3'], rows, labels, { iterations: 50 })).toEqual(
      trainLogistic(['x1', 'x2', 'x3'], rows, labels, { iterations: 50 }),
    );
  });
});

describe('AUC', () => {
  it('is 1 for a perfect ranking, 0 for a reversed one, 0.5 for ties', () => {
    expect(auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1])).toBe(1);
    expect(auc([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1])).toBe(0);
    expect(auc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1])).toBe(0.5);
  });

  it('matches a hand count on a small example', () => {
    // positives {0.6, 0.3}, negatives {0.4, 0.1}: pairs won = (0.6>0.4, 0.6>0.1, 0.3>0.1) = 3 of 4
    expect(auc([0.6, 0.3, 0.4, 0.1], [1, 1, 0, 0])).toBe(0.75);
  });
});
