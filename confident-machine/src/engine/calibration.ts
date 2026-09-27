/**
 * Calibration: does "80% sure" come true about 80% of the time?
 *
 * Answers are grouped by stated confidence. For each group we compare the
 * average confidence with the share that were actually right. A perfectly
 * calibrated forecaster lands on the diagonal. Points below the diagonal mean
 * overconfidence (sure, but wrong more often than they thought).
 */

export interface Answer {
  /** stated probability of being right, 0.5–1 for a two-choice question */
  confidence: number;
  correct: boolean;
}

export interface CalibrationBin {
  lo: number;
  hi: number;
  n: number;
  meanConfidence: number;
  accuracy: number;
}

export interface CalibrationSummary {
  n: number;
  meanConfidence: number;
  accuracy: number;
  /** meanConfidence − accuracy: positive = overconfident */
  gap: number;
  /** mean squared error of the stated probabilities; 0 is perfect, 0.25 is always saying 50% */
  brier: number;
  verdict: 'overconfident' | 'underconfident' | 'well calibrated' | 'no answers yet';
}

/** Bin edges for two-choice questions: 50–59, 60–69, 70–79, 80–89, 90–100. */
export const DEFAULT_EDGES = [0.5, 0.6, 0.7, 0.8, 0.9, 1];

export function calibrationCurve(answers: Answer[], edges: number[] = DEFAULT_EDGES): CalibrationBin[] {
  const bins: CalibrationBin[] = [];
  for (let b = 0; b < edges.length - 1; b += 1) {
    const lo = edges[b]!;
    const hi = edges[b + 1]!;
    const last = b === edges.length - 2;
    const inBin = answers.filter((a) => a.confidence >= lo && (last ? a.confidence <= hi : a.confidence < hi));
    const n = inBin.length;
    bins.push({
      lo,
      hi,
      n,
      meanConfidence: n ? mean(inBin.map((a) => a.confidence)) : NaN,
      accuracy: n ? inBin.filter((a) => a.correct).length / n : NaN,
    });
  }
  return bins;
}

export function brierScore(answers: Answer[]): number {
  if (!answers.length) return NaN;
  return mean(answers.map((a) => (a.confidence - (a.correct ? 1 : 0)) ** 2));
}

export function summarize(answers: Answer[], tolerance = 0.05): CalibrationSummary {
  if (!answers.length) {
    return { n: 0, meanConfidence: NaN, accuracy: NaN, gap: NaN, brier: NaN, verdict: 'no answers yet' };
  }
  const meanConfidence = mean(answers.map((a) => a.confidence));
  const accuracy = answers.filter((a) => a.correct).length / answers.length;
  const gap = meanConfidence - accuracy;
  const verdict = gap > tolerance ? 'overconfident' : gap < -tolerance ? 'underconfident' : 'well calibrated';
  return { n: answers.length, meanConfidence, accuracy, gap, brier: brierScore(answers), verdict };
}

function mean(xs: number[]): number {
  let total = 0;
  for (const x of xs) total += x;
  return total / xs.length;
}
