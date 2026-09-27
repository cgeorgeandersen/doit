import { describe, expect, it } from 'vitest';
import { brierScore, calibrationCurve, summarize, type Answer } from '../src/engine/calibration';

const known: Answer[] = [
  // 50–59%: two answers, one right
  { confidence: 0.5, correct: true },
  { confidence: 0.55, correct: false },
  // 60–69%: one answer, right
  { confidence: 0.65, correct: true },
  // 70–79%: none
  // 80–89%: two answers, one right
  { confidence: 0.8, correct: true },
  { confidence: 0.85, correct: false },
  // 90–100%: three answers, two right (including an exact 100%)
  { confidence: 0.9, correct: true },
  { confidence: 1, correct: true },
  { confidence: 0.95, correct: false },
];

describe('calibration curve', () => {
  const bins = calibrationCurve(known);

  it('puts each answer in the right confidence bin', () => {
    expect(bins.map((b) => b.n)).toEqual([2, 1, 0, 2, 3]);
  });

  it('computes mean confidence and accuracy per bin', () => {
    expect(bins[0]!.meanConfidence).toBeCloseTo(0.525, 12);
    expect(bins[0]!.accuracy).toBe(0.5);
    expect(bins[1]!.accuracy).toBe(1);
    expect(Number.isNaN(bins[2]!.accuracy)).toBe(true); // empty bin: no claim either way
    expect(bins[3]!.meanConfidence).toBeCloseTo(0.825, 12);
    expect(bins[4]!.meanConfidence).toBeCloseTo((0.9 + 1 + 0.95) / 3, 12);
    expect(bins[4]!.accuracy).toBeCloseTo(2 / 3, 12);
  });
});

describe('calibration summary', () => {
  it('reports overall confidence, accuracy and the gap between them', () => {
    const s = summarize(known);
    const meanConf = (0.5 + 0.55 + 0.65 + 0.8 + 0.85 + 0.9 + 1 + 0.95) / 8;
    expect(s.n).toBe(8);
    expect(s.meanConfidence).toBeCloseTo(meanConf, 12);
    expect(s.accuracy).toBe(5 / 8);
    expect(s.gap).toBeCloseTo(meanConf - 5 / 8, 12);
    expect(s.verdict).toBe('overconfident');
  });

  it('calls a forecaster well calibrated when confidence matches accuracy', () => {
    const answers: Answer[] = [
      { confidence: 0.75, correct: true },
      { confidence: 0.75, correct: true },
      { confidence: 0.75, correct: true },
      { confidence: 0.75, correct: false },
    ];
    expect(summarize(answers).verdict).toBe('well calibrated');
  });

  it('flags underconfidence too', () => {
    expect(summarize([{ confidence: 0.5, correct: true }, { confidence: 0.6, correct: true }]).verdict).toBe(
      'underconfident',
    );
  });

  it('handles an empty answer sheet', () => {
    expect(summarize([]).verdict).toBe('no answers yet');
  });
});

describe('Brier score', () => {
  it('is 0 for certain and right, 1 for certain and wrong, 0.25 for always 50%', () => {
    expect(brierScore([{ confidence: 1, correct: true }])).toBe(0);
    expect(brierScore([{ confidence: 1, correct: false }])).toBe(1);
    expect(brierScore([{ confidence: 0.5, correct: true }, { confidence: 0.5, correct: false }])).toBe(0.25);
  });

  it('matches a hand calculation', () => {
    // (0.8−1)² = 0.04 and (0.6−0)² = 0.36 → mean 0.2
    expect(brierScore([{ confidence: 0.8, correct: true }, { confidence: 0.6, correct: false }])).toBeCloseTo(0.2, 12);
  });
});
