/**
 * Predictive policing, and the loop that breaks it. The forecast sends
 * patrols where the most crime was recorded. But police record more of the
 * crime that happens where police are, so wherever the history started out
 * heavier gets more patrols, so more records, so more patrols. The true crime
 * rate here is the same in every block; the forecast never finds that out.
 *
 * This is a small version of the urn models in Ensign et al., "Runaway
 * Feedback Loops in Predictive Policing" (2018).
 */
import { COLS, type District, districtOf, RIVER_ROW, ROWS } from './city';
import { hash, Rng } from './rng';

export interface Cell {
  bi: number;
  bj: number;
  district: District;
  /** Incidents per day that really happen. */
  trueRate: number;
}

export interface ForecastParams {
  /** Patrol units to place each day. */
  patrols: number;
  /** Share of incidents residents report on their own, with no police nearby. */
  reportRate: number;
  /** Extra share a patrol in the block discovers. */
  discoverRate: number;
  /** Learn only from incidents residents reported (the fix the paper proposes). */
  reportedOnly: boolean;
  /** How much a day of data moves the forecast. */
  learningRate: number;
  seed: number;
}

export const DEFAULT_FORECAST: ForecastParams = {
  patrols: 16,
  reportRate: 0.2,
  discoverRate: 0.75,
  reportedOnly: false,
  learningRate: 0.05,
  seed: 7,
};

export interface ForecastState {
  day: number;
  cells: Cell[];
  /** What the model believes, incidents per day per cell. */
  risk: number[];
  patrolled: boolean[];
  /** Today's recorded incidents per cell. */
  recorded: number[];
  totalRecorded: number[];
  totalTrue: number[];
  history: { day: number; eastPatrols: number; eastRecorded: number; eastTrue: number; hitRate: number }[];
  rng: Rng;
  params: ForecastParams;
  neighbors?: number[][];
}

/** Historical arrest records were heavier in Eastside: that's where the department patrolled before any algorithm. */
export const HISTORIC_BIAS: Partial<Record<District, number>> = { Eastside: 1.5, Harbor: 1.1 };

export function initForecast(params: ForecastParams = DEFAULT_FORECAST): ForecastState {
  const rng = new Rng(hash('forecast', params.seed));
  const cells: Cell[] = [];
  for (let bj = 0; bj < ROWS - 1; bj++) {
    if (bj === RIVER_ROW) continue;
    for (let bi = 0; bi < COLS - 1; bi++) {
      cells.push({ bi, bj, district: districtOf(bi, bj), trueRate: 0.5 * (0.85 + rng.next() * 0.3) });
    }
  }
  const risk = cells.map((c) => c.trueRate * 0.35 * (HISTORIC_BIAS[c.district] ?? 1) * (0.8 + rng.next() * 0.4));
  return {
    day: 0,
    cells,
    risk,
    patrolled: cells.map(() => false),
    recorded: cells.map(() => 0),
    totalRecorded: cells.map(() => 0),
    totalTrue: cells.map(() => 0),
    history: [],
    rng,
    params,
  };
}

function poisson(rng: Rng, lambda: number): number {
  const L = Math.exp(-lambda);
  let n = 0;
  let p = rng.next();
  while (p > L && n < 50) {
    n++;
    p *= rng.next();
  }
  return n;
}

function binomial(rng: Rng, n: number, p: number): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (rng.next() < p) k++;
  return k;
}

/** One day: place patrols by forecast, let crime happen, record what's seen, update the forecast. */
export function stepForecast(s: ForecastState): void {
  const { params, rng, cells } = s;
  // Patrols go to the top-scoring blocks, the way hot-spot software marks its
  // boxes. A block's score is its own forecast plus half its neighbors'
  // average ("near-repeat" modeling: crime is expected to cluster).
  const score = forecastScores(s);
  const order = score.map((r, k) => [r, k] as const).sort((a, b) => b[0] - a[0]);
  s.patrolled = cells.map(() => false);
  for (let k = 0; k < params.patrols; k++) s.patrolled[(order[k] as readonly [number, number])[1]] = true;

  let eastRecorded = 0;
  let allRecorded = 0;
  let eastTrue = 0;
  let allTrue = 0;
  let hits = 0;
  cells.forEach((c, k) => {
    const happened = poisson(rng, c.trueRate);
    const reported = binomial(rng, happened, params.reportRate);
    const discovered = s.patrolled[k] ? binomial(rng, happened - reported, params.discoverRate / (1 - params.reportRate)) : 0;
    const recorded = reported + discovered;
    s.recorded[k] = recorded;
    s.totalRecorded[k] = (s.totalRecorded[k] as number) + recorded;
    s.totalTrue[k] = (s.totalTrue[k] as number) + happened;
    const learnFrom = params.reportedOnly ? reported / params.reportRate : recorded;
    s.risk[k] = (1 - params.learningRate) * (s.risk[k] as number) + params.learningRate * learnFrom;
    allRecorded += recorded;
    allTrue += happened;
    if (s.patrolled[k]) hits += recorded;
    if (c.district === 'Eastside') {
      eastRecorded += recorded;
      eastTrue += happened;
    }
  });
  s.day++;
  const eastPatrols = cells.filter((c, k) => s.patrolled[k] && c.district === 'Eastside').length / params.patrols;
  s.history.push({
    day: s.day,
    eastPatrols,
    eastRecorded: allRecorded ? eastRecorded / allRecorded : 0,
    eastTrue: allTrue ? eastTrue / allTrue : 0,
    hitRate: allRecorded ? hits / allRecorded : 0,
  });
}

export function neighborsOf(s: ForecastState, k: number): number[] {
  const c = s.cells[k] as Cell;
  const out: number[] = [];
  s.cells.forEach((o, i) => {
    if (i !== k && Math.abs(o.bi - c.bi) <= 1 && Math.abs(o.bj - c.bj) <= 1) out.push(i);
  });
  return out;
}

/** What the patrol plan ranks by: own forecast plus half the neighbors' average. */
export function forecastScores(s: ForecastState): number[] {
  if (!s.neighbors) s.neighbors = s.cells.map((_, k) => neighborsOf(s, k));
  return s.risk.map((r, k) => {
    const nb = (s.neighbors as number[][])[k] as number[];
    const mean = nb.length ? nb.reduce((a, i) => a + (s.risk[i] as number), 0) / nb.length : 0;
    return r + 0.5 * mean;
  });
}

export function eastShareOfTrueRate(s: ForecastState): number {
  const total = s.cells.reduce((a, c) => a + c.trueRate, 0);
  return s.cells.filter((c) => c.district === 'Eastside').reduce((a, c) => a + c.trueRate, 0) / total;
}
