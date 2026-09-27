/**
 * A synthetic hiring history, built so that we know exactly what is true.
 *
 * Two groups of applicants, A and B, have identical skills and experience by
 * construction. Past hiring managers nonetheless favoured group A. Because the
 * town's neighbourhoods reflect its history, most of group B lives in
 * Eastfield and most of group A in Westfield.
 *
 * A screener trained on this history never sees the group column, but it can
 * see the neighbourhood (a zip code), and that is enough for it to rediscover
 * the old bias. Remove the neighbourhood and the screener has only
 * qualifications left, which are the same for both groups.
 *
 * All names and numbers here are invented for the demonstration.
 */
import { mulberry32, normal, type Rng } from './rng';
import { auc, score, sigmoid, trainLogistic, type LogisticModel } from './logistic';

export type Group = 'A' | 'B';

export interface Applicant {
  id: number;
  group: Group;
  /** 1 = lives in Eastfield (zip 05501), 0 = Westfield (zip 05502) */
  eastfield: 0 | 1;
  /** skills-test score, 0–100 */
  skill: number;
  /** years of relevant experience */
  experience: number;
  /** the historical decision; only present in the training history */
  hired?: 0 | 1;
}

export interface WorldParams {
  shareB: number;
  eastfieldIfB: number;
  eastfieldIfA: number;
  skillMean: number;
  skillSd: number;
  experienceMean: number;
  experienceSd: number;
  /** past managers' decision rule, in log-odds */
  base: number;
  perSkillSd: number;
  perExperienceSd: number;
  /** how much past managers penalised group B, in log-odds */
  biasAgainstB: number;
}

export const DEFAULT_WORLD: WorldParams = {
  shareB: 0.5,
  eastfieldIfB: 0.85,
  eastfieldIfA: 0.15,
  skillMean: 70,
  skillSd: 10,
  experienceMean: 5,
  experienceSd: 2.5,
  base: -1.2,
  perSkillSd: 1.3,
  perExperienceSd: 0.6,
  biasAgainstB: 1.6,
};

export const FEATURES = {
  skill: { label: 'Skills-test score', get: (a: Applicant) => a.skill },
  experience: { label: 'Years of experience', get: (a: Applicant) => a.experience },
  eastfield: { label: 'Lives in Eastfield (zip code)', get: (a: Applicant) => a.eastfield },
  groupB: { label: 'Belongs to group B', get: (a: Applicant) => (a.group === 'B' ? 1 : 0) },
} as const;

export type FeatureKey = keyof typeof FEATURES;

/** Applicants with qualifications drawn from the same distribution for both groups. */
export function generateApplicants(n: number, seed: number, world: WorldParams = DEFAULT_WORLD): Applicant[] {
  const rng = mulberry32(seed);
  const out: Applicant[] = [];
  for (let id = 0; id < n; id += 1) {
    const group: Group = rng() < world.shareB ? 'B' : 'A';
    const eastfield = rng() < (group === 'B' ? world.eastfieldIfB : world.eastfieldIfA) ? 1 : 0;
    const skill = clamp(normal(rng, world.skillMean, world.skillSd), 0, 100);
    const experience = Math.max(0, normal(rng, world.experienceMean, world.experienceSd));
    out.push({ id, group, eastfield, skill: round1(skill), experience: round1(experience) });
  }
  return out;
}

/** Past decisions: driven by qualifications, plus a penalty on group B. */
export function labelHistory(applicants: Applicant[], seed: number, world: WorldParams = DEFAULT_WORLD): Applicant[] {
  const rng: Rng = mulberry32(seed ^ 0x5bd1e995);
  return applicants.map((a) => {
    const logit =
      world.base +
      world.perSkillSd * ((a.skill - world.skillMean) / world.skillSd) +
      world.perExperienceSd * ((a.experience - world.experienceMean) / world.experienceSd) -
      (a.group === 'B' ? world.biasAgainstB : 0);
    return { ...a, hired: rng() < sigmoid(logit) ? 1 : 0 };
  });
}

export function featureRow(a: Applicant, features: FeatureKey[]): number[] {
  return features.map((f) => FEATURES[f].get(a));
}

export function trainScreener(history: Applicant[], features: FeatureKey[]): LogisticModel {
  if (features.length === 0) throw new Error('The screener needs at least one feature.');
  return trainLogistic(
    features,
    history.map((a) => featureRow(a, features)),
    history.map((a) => a.hired ?? 0),
  );
}

export interface ScreeningResult {
  scores: number[];
  advanced: boolean[];
  /** the score an applicant had to beat */
  cutoff: number;
}

/** Advance the top `share` of the pool by model score (a common way screeners are used). */
export function screen(model: LogisticModel, pool: Applicant[], features: FeatureKey[], share = 0.3): ScreeningResult {
  const scores = pool.map((a) => score(model, featureRow(a, features)));
  const sorted = [...scores].sort((a, b) => b - a);
  const k = Math.max(1, Math.round(share * pool.length));
  const cutoff = sorted[k - 1]!;
  // Ties at the cutoff are broken by position so exactly k people advance.
  let remaining = k;
  const advanced = scores.map((s) => s > cutoff);
  remaining -= advanced.filter(Boolean).length;
  scores.forEach((s, i) => {
    if (remaining > 0 && s === cutoff) {
      advanced[i] = true;
      remaining -= 1;
    }
  });
  return { scores, advanced, cutoff };
}

export interface GroupRate {
  group: Group;
  n: number;
  selected: number;
  rate: number;
}

export interface FairnessReport {
  rates: Record<Group, GroupRate>;
  /** lower group's selection rate divided by the higher group's (1 = equal) */
  impactRatio: number;
  /** the group with the lower rate */
  disadvantaged: Group;
  /** the traditional four-fifths threshold */
  passesFourFifths: boolean;
}

export function selectionRates(pool: Applicant[], advanced: boolean[]): FairnessReport {
  const rates: Record<Group, GroupRate> = {
    A: { group: 'A', n: 0, selected: 0, rate: 0 },
    B: { group: 'B', n: 0, selected: 0, rate: 0 },
  };
  pool.forEach((a, i) => {
    rates[a.group].n += 1;
    if (advanced[i]) rates[a.group].selected += 1;
  });
  for (const g of ['A', 'B'] as const) rates[g].rate = rates[g].n ? rates[g].selected / rates[g].n : 0;
  const hi = Math.max(rates.A.rate, rates.B.rate);
  const lo = Math.min(rates.A.rate, rates.B.rate);
  const impactRatio = hi > 0 ? lo / hi : 1;
  return {
    rates,
    impactRatio,
    disadvantaged: rates.B.rate <= rates.A.rate ? 'B' : 'A',
    passesFourFifths: impactRatio >= 0.8,
  };
}

/** How well the screener reproduces the historical decisions (AUC on held-out history). */
export function agreementWithHistory(model: LogisticModel, history: Applicant[], features: FeatureKey[]): number {
  return auc(
    history.map((a) => score(model, featureRow(a, features))),
    history.map((a) => a.hired ?? 0),
  );
}

export interface Counterfactual {
  applicant: Applicant;
  scoreNow: number;
  scoreIfMoved: number;
  cutoff: number;
}

/**
 * Find a qualified applicant who was screened out but would have advanced
 * with the only change being their neighbourhood. Used to show a
 * "what would have changed the decision?" explanation.
 */
export function findNeighbourhoodCounterfactual(
  model: LogisticModel,
  pool: Applicant[],
  features: FeatureKey[],
  result: ScreeningResult,
): Counterfactual | null {
  if (!features.includes('eastfield')) return null;
  let best: Counterfactual | null = null;
  pool.forEach((a, i) => {
    if (result.advanced[i] || a.eastfield !== 1) return;
    const moved: Applicant = { ...a, eastfield: 0 };
    const scoreIfMoved = score(model, featureRow(moved, features));
    if (scoreIfMoved <= result.cutoff) return;
    // Prefer the best-qualified such applicant (skills and experience together):
    // the clearest illustration that the zip code, not merit, decided the outcome.
    if (!best || qualification(a) > qualification(best.applicant)) {
      best = { applicant: a, scoreNow: result.scores[i]!, scoreIfMoved, cutoff: result.cutoff };
    }
  });
  return best;
}

export interface ScenarioResult {
  features: FeatureKey[];
  model: LogisticModel;
  screening: ScreeningResult;
  fairness: FairnessReport;
  agreement: number;
  counterfactual: Counterfactual | null;
}

export interface Scenario {
  history: Applicant[];
  holdout: Applicant[];
  pool: Applicant[];
}

/** The three populations the demo uses, all from one seed. */
export function buildScenario(seed = 20260927, world: WorldParams = DEFAULT_WORLD): Scenario {
  const labelled = labelHistory(generateApplicants(3000, seed, world), seed, world);
  return {
    history: labelled.slice(0, 2000),
    holdout: labelled.slice(2000),
    pool: generateApplicants(2000, seed + 1, world),
  };
}

/** Train a screener on a feature set and measure what it does to a fresh pool. */
export function runScenario(scenario: Scenario, features: FeatureKey[], share = 0.3): ScenarioResult {
  const model = trainScreener(scenario.history, features);
  const screening = screen(model, scenario.pool, features, share);
  return {
    features,
    model,
    screening,
    fairness: selectionRates(scenario.pool, screening.advanced),
    agreement: agreementWithHistory(model, scenario.holdout, features),
    counterfactual: findNeighbourhoodCounterfactual(model, scenario.pool, features, screening),
  };
}

/** Qualifications on the same scale past managers used, before any group penalty. */
function qualification(a: Applicant, world: WorldParams = DEFAULT_WORLD): number {
  return (
    world.perSkillSd * ((a.skill - world.skillMean) / world.skillSd) +
    world.perExperienceSd * ((a.experience - world.experienceMean) / world.experienceSd)
  );
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
