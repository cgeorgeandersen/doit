/**
 * How answers become a result. Pure functions, no DOM, so every rule here is
 * covered by tests/scoring.test.ts.
 *
 * 1. Each answer scores 0 to 3: the option's place in its list.
 * 2. A dimension's points are the total of its answers (0 to 9 for three questions).
 * 3. The stage comes from the average answer: the last stage whose minAverage
 *    the average reaches. Dimensions get a stage the same way.
 * 4. The weakest-link rule: the overall stage can sit at most
 *    `rules.weakestLinkCap` stages above the weakest dimension's stage.
 * 5. The gaps are the dimensions with points to gain, most in need first:
 *    lowest average, then lowest single answer, then the order they're asked in.
 *    Each gap's next step comes from its lowest answer (the first, on a tie).
 */
import { allQuestions, type Dimension, type Question, type ScoringModel, type Stage } from './model.ts';

/** The best answer to any question. Every question has four options: 0, 1, 2, 3. */
export const MAX_ANSWER = 3;

/** Averages like 27 / 18 are exact, but 0.1 + 0.2 isn't; this keeps a boundary from slipping. */
const EPSILON = 1e-9;

export interface DimensionScore {
  dimension: Dimension;
  /** Its place in the order dimensions are asked, from 0. */
  index: number;
  points: number;
  max: number;
  /** Average answer, 0 to 3. */
  average: number;
  stageIndex: number;
  /** The lowest answer in this dimension (the first one, on a tie). */
  weakest: { question: Question; answer: number };
}

export interface Result {
  answers: readonly number[];
  points: number;
  max: number;
  /** Average answer across every question, 0 to 3. */
  average: number;
  /** The stage the average alone reaches. */
  averageStageIndex: number;
  /** The overall stage, after the weakest-link rule. */
  stageIndex: number;
  /** The dimension that held the stage down, when the weakest-link rule changed it. */
  cappedBy: DimensionScore | null;
  dimensions: DimensionScore[];
  /** The biggest gaps, most in need first; empty when nothing has points to gain. */
  gaps: DimensionScore[];
}

export function questionCount(model: Pick<ScoringModel, 'dimensions'>): number {
  return model.dimensions.reduce((n, d) => n + d.questions.length, 0);
}

/** A whole number from 0 to 3. */
export function isAnswer(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_ANSWER;
}

/** True when there's a valid answer for every question, in order. */
export function isComplete(answers: readonly unknown[], model: Pick<ScoringModel, 'dimensions'>): answers is number[] {
  return answers.length === questionCount(model) && answers.every(isAnswer);
}

/** The index of the stage an average reaches: the last stage whose minAverage it meets. */
export function stageIndexFor(average: number, stages: readonly Stage[]): number {
  let index = 0;
  stages.forEach((stage, i) => {
    if (average + EPSILON >= stage.minAverage) index = i;
  });
  return index;
}

/** Most in need first: lowest average, then lowest single answer, then the order asked. */
function byNeed(a: DimensionScore, b: DimensionScore): number {
  return a.average - b.average || a.weakest.answer - b.weakest.answer || a.index - b.index;
}

export function score(answers: readonly number[], model: ScoringModel): Result {
  if (!isComplete(answers, model)) {
    throw new Error(`Expected ${questionCount(model)} answers from 0 to ${MAX_ANSWER}, got [${answers.join(', ')}]`);
  }
  if (model.stages.length === 0) throw new Error('The model needs at least one stage');

  let cursor = 0;
  const dimensions: DimensionScore[] = model.dimensions.map((dimension, index) => {
    const own = answers.slice(cursor, cursor + dimension.questions.length);
    cursor += dimension.questions.length;
    const points = own.reduce((sum, a) => sum + a, 0);
    const average = own.length === 0 ? 0 : points / own.length;
    let weakestAt = 0;
    own.forEach((answer, i) => {
      if (answer < own[weakestAt]!) weakestAt = i;
    });
    return {
      dimension,
      index,
      points,
      max: dimension.questions.length * MAX_ANSWER,
      average,
      stageIndex: stageIndexFor(average, model.stages),
      weakest: { question: dimension.questions[weakestAt]!, answer: own[weakestAt] ?? 0 },
    };
  });

  const points = answers.reduce((sum, a) => sum + a, 0);
  const max = answers.length * MAX_ANSWER;
  const average = answers.length === 0 ? 0 : points / answers.length;
  const averageStageIndex = stageIndexFor(average, model.stages);

  const inNeed = [...dimensions].sort(byNeed);
  let stageIndex = averageStageIndex;
  let cappedBy: DimensionScore | null = null;
  const cap = model.rules.weakestLinkCap;
  const weakestDimension = inNeed[0];
  if (cap !== null && weakestDimension) {
    const ceiling = Math.min(...dimensions.map((d) => d.stageIndex)) + cap;
    if (ceiling < stageIndex) {
      stageIndex = ceiling;
      cappedBy = weakestDimension;
    }
  }

  return {
    answers,
    points,
    max,
    average,
    averageStageIndex,
    stageIndex,
    cappedBy,
    dimensions,
    gaps: inNeed.filter((d) => d.points < d.max).slice(0, model.rules.gapCount),
  };
}

/** Every question in the order asked, numbered from 0: handy for the question screens. */
export function questionAt(model: Pick<ScoringModel, 'dimensions'>, index: number) {
  return allQuestions(model.dimensions)[index];
}
