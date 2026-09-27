/**
 * Logistic regression, from scratch.
 *
 * The screener gives each applicant a score  z = b + Σ wᵢ·xᵢ  and turns it into
 * a probability with the sigmoid  σ(z) = 1 / (1 + e^(−z)).  Training nudges the
 * weights, over and over, in the direction that makes the past decisions more
 * likely (gradient descent on the log loss). Nothing here knows what "fair" is:
 * the weights end up encoding whatever pattern best reproduces the labels.
 *
 * Features are standardized (mean 0, sd 1) first, so the learned weights are
 * comparable: each one says how much a one-standard-deviation change in that
 * feature moves the score.
 */

export interface LogisticModel {
  featureNames: string[];
  /** weights on standardized features */
  weights: number[];
  bias: number;
  means: number[];
  sds: number[];
}

export interface TrainOptions {
  learningRate?: number;
  iterations?: number;
  /** L2 penalty, keeps weights from growing without bound on separable data */
  l2?: number;
}

export function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z); // numerically stable for large negative z
  return e / (1 + e);
}

export function trainLogistic(
  featureNames: string[],
  rows: number[][],
  labels: number[],
  { learningRate = 0.5, iterations = 1200, l2 = 1e-3 }: TrainOptions = {},
): LogisticModel {
  const n = rows.length;
  const d = featureNames.length;
  if (n === 0) throw new Error('No training rows.');
  if (labels.length !== n) throw new Error('Each row needs a label.');

  const means = new Array<number>(d).fill(0);
  const sds = new Array<number>(d).fill(0);
  for (const row of rows) for (let j = 0; j < d; j += 1) means[j] = means[j]! + row[j]! / n;
  for (const row of rows) for (let j = 0; j < d; j += 1) sds[j] = sds[j]! + (row[j]! - means[j]!) ** 2 / n;
  for (let j = 0; j < d; j += 1) sds[j] = Math.sqrt(sds[j]!) || 1;

  const z = rows.map((row) => row.map((x, j) => (x - means[j]!) / sds[j]!));
  const weights = new Array<number>(d).fill(0);
  let bias = 0;

  for (let it = 0; it < iterations; it += 1) {
    const grad = new Array<number>(d).fill(0);
    let gradBias = 0;
    for (let i = 0; i < n; i += 1) {
      const zi = z[i]!;
      let s = bias;
      for (let j = 0; j < d; j += 1) s += weights[j]! * zi[j]!;
      const err = sigmoid(s) - labels[i]!; // derivative of log loss w.r.t. the score
      gradBias += err;
      for (let j = 0; j < d; j += 1) grad[j] = grad[j]! + err * zi[j]!;
    }
    bias -= (learningRate * gradBias) / n;
    for (let j = 0; j < d; j += 1) weights[j] = weights[j]! - learningRate * (grad[j]! / n + l2 * weights[j]!);
  }

  return { featureNames: [...featureNames], weights, bias, means, sds };
}

/** The raw score (log-odds) for one row of original-unit features. */
export function score(model: LogisticModel, row: number[]): number {
  let s = model.bias;
  for (let j = 0; j < model.weights.length; j += 1) {
    s += model.weights[j]! * ((row[j]! - model.means[j]!) / model.sds[j]!);
  }
  return s;
}

export function predictProbability(model: LogisticModel, row: number[]): number {
  return sigmoid(score(model, row));
}

/** Average log loss: lower means the model finds the labels less surprising. */
export function logLoss(model: LogisticModel, rows: number[][], labels: number[]): number {
  let total = 0;
  rows.forEach((row, i) => {
    const p = Math.min(1 - 1e-12, Math.max(1e-12, predictProbability(model, row)));
    total += labels[i] ? -Math.log(p) : -Math.log(1 - p);
  });
  return total / rows.length;
}

/**
 * Area under the ROC curve: pick one past hire and one past rejection at random;
 * how often does the model score the hire higher? 0.5 = coin flip, 1 = perfect.
 * Computed with the rank-sum (Mann–Whitney U) identity, handling ties.
 */
export function auc(scores: number[], labels: number[]): number {
  const order = scores.map((s, i) => [s, i] as const).sort((a, b) => a[0] - b[0]);
  const ranks = new Array<number>(scores.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j += 1;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[order[k]![1]] = avgRank;
    i = j + 1;
  }
  let pos = 0;
  let rankSum = 0;
  labels.forEach((y, k) => {
    if (y) {
      pos += 1;
      rankSum += ranks[k]!;
    }
  });
  const neg = labels.length - pos;
  if (pos === 0 || neg === 0) return 0.5;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}
