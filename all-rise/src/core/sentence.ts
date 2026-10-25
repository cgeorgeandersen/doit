import type { Case, Severity } from './types';

export type Sentence =
  | { kind: 'free' }
  | { kind: 'fine'; amount: number }
  | { kind: 'service'; hours: number }
  | { kind: 'probation'; months: number }
  | { kind: 'prison'; years: number | 'life' }
  | { kind: 'death' }
  | { kind: 'special' };

export type SentenceKind = Sentence['kind'];

/** The stops on each slider. Uneven on purpose: the difference between $50 and $500 matters as much as $50,000 and $500,000. */
export const STEPS = {
  fine: [50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 1_000_000],
  service: [10, 25, 50, 100, 200, 500, 1_000],
  probation: [3, 6, 12, 18, 24, 36, 60],
  prison: [1, 2, 3, 5, 7, 10, 15, 20, 25, 30, 40, 50, 75, 99, 'life'] as Array<number | 'life'>,
} as const;

/**
 * Puts any sentence on one 0 to 10 scale so cases can be scored. Each kind
 * grows with the log of its amount: ten times the fine is one more step of
 * severity, not ten.
 */
export function severity(sentence: Sentence, kase: Pick<Case, 'special'>): Severity {
  switch (sentence.kind) {
    case 'free':
      return 0;
    case 'fine':
      return clamp(Math.log10(sentence.amount) / 2, 0.5, 3);
    case 'service':
      return clamp(1 + Math.log10(sentence.hours / 10) * 0.75, 1, 2.5);
    case 'probation':
      return 2 + (clamp(sentence.months, 0, 60) / 60) * 2;
    case 'prison':
      return sentence.years === 'life' ? 9.3 : clamp(5 + 2 * Math.log10(sentence.years), 5, 9);
    case 'death':
      return 10;
    case 'special':
      return kase.special?.severity ?? 0;
  }
}

export function describe(sentence: Sentence, kase: Pick<Case, 'special'>): string {
  switch (sentence.kind) {
    case 'free':
      return 'Set free';
    case 'fine':
      return `A ${money(sentence.amount)} fine`;
    case 'service':
      return `${sentence.hours.toLocaleString('en-US')} hours of community service`;
    case 'probation': {
      const { months } = sentence;
      if (months % 12 !== 0) return `${months} months' probation`;
      return months === 12 ? "A year's probation" : `${months / 12} years' probation`;
    }
    case 'prison':
      return sentence.years === 'life' ? 'Life in prison' : `${plural(sentence.years, 'year')} in prison`;
    case 'death':
      return 'The death penalty';
    case 'special':
      return kase.special?.label ?? 'A creative sentence';
  }
}

export function money(amount: number): string {
  return amount >= 1_000_000 ? `$${amount / 1_000_000} million` : `$${amount.toLocaleString('en-US')}`;
}

/** Where a sentence lands against what legal experts call proportionate. */
export type Band = 'lenient' | 'fair' | 'harsh' | 'absurd';

/** How far outside the fair range a sentence can stray and still count as within it. */
export const SLACK = 0.75;
/** This far above the fair range, the appeals court throws the sentence out. */
export const ABSURD = 4;
/**
 * Below this top of the fair range, the case isn't one of the worst murders,
 * and in the US that rules out the death penalty (Kennedy v. Louisiana, 2008).
 */
export const CAPITAL = 8;

export function band(kase: Pick<Case, 'fair'>, sev: Severity): Band {
  const [lo, hi] = kase.fair;
  if (sev >= hi + ABSURD || (sev >= 10 && hi < CAPITAL)) return 'absurd';
  if (sev > hi + SLACK) return 'harsh';
  if (sev < lo - SLACK) return 'lenient';
  return 'fair';
}

/** 100 inside the fair range, losing 18 points per step of severity outside it. */
export function justiceScore(kase: Pick<Case, 'fair'>, sev: Severity): number {
  const [lo, hi] = kase.fair;
  const off = sev < lo ? lo - sev : sev > hi ? sev - hi : 0;
  return Math.round(clamp(100 - off * 18, 0, 100));
}

/** 100 when the gallery got exactly what it wanted, losing 14 points per step away from it. */
export function crowdScore(kase: Pick<Case, 'crowd'>, sev: Severity): number {
  return Math.round(clamp(100 - Math.abs(sev - kase.crowd) * 14, 0, 100));
}

export interface Ruling {
  caseId: string;
  sentence: Sentence;
  text: string;
  severity: Severity;
  band: Band;
  justice: number;
  crowd: number;
  /** How far outside the fair range, signed: below it is negative, above it positive, inside it 0. */
  lean: number;
  headline: string;
  /** What the legal experts said, in one line. */
  experts: string;
  /** What the gallery did, in one line. */
  gallery: string;
}

export function rule(kase: Case, sentence: Sentence): Ruling {
  const sev = severity(sentence, kase);
  const b = band(kase, sev);
  const crowd = crowdScore(kase, sev);
  return {
    caseId: kase.id,
    sentence,
    text: describe(sentence, kase),
    severity: sev,
    band: b,
    justice: justiceScore(kase, sev),
    crowd,
    lean: sev - clamp(sev, kase.fair[0], kase.fair[1]),
    headline: headline(kase, sentence, b),
    experts: expertsLine(kase, sentence, b),
    gallery: crowd >= 80 ? 'The gallery cheers.' : crowd >= 50 ? 'The gallery murmurs.' : 'The gallery boos.',
  };
}

function headline(kase: Case, sentence: Sentence, b: Band): string {
  const h = kase.headlines;
  if (sentence.kind === 'special' && kase.special) return kase.special.headline;
  if (sentence.kind === 'free' && h.free) return h.free;
  if (sentence.kind === 'death' && h.death && b !== 'absurd') return h.death;
  if (b === 'absurd') return h.absurd ?? `Appeals Court Overturns Judge's Sentence in ${kase.title}, Calls It 'Unhinged'`;
  if (b === 'lenient') return h.lenient ?? h.fair;
  return h[b];
}

function expertsLine(kase: Case, sentence: Sentence, b: Band): string {
  switch (b) {
    case 'absurd':
      return sentence.kind === 'death'
        ? 'Overturned: the death penalty is reserved for the worst murders.'
        : 'Overturned on appeal before lunch.';
    case 'harsh':
      return 'Legal experts call it heavy-handed.';
    case 'fair':
      return kase.contested || kase.fair[1] - kase.fair[0] >= 4
        ? 'Legal experts are split, which may mean you got it about right.'
        : 'Legal experts call it proportionate.';
    case 'lenient':
      // In the US, the prosecution can't appeal an acquittal (double jeopardy).
      return sentence.kind === 'free' && kase.fair[0] >= 4
        ? "Prosecutors can't appeal an acquittal. They walk."
        : 'Legal experts call it soft.';
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
