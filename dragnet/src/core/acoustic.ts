/**
 * Gunshot detection: rooftop microphones hear a loud, sharp sound, locate it
 * from the time it reached each one, and a classifier (plus, in real systems,
 * a person at the vendor) decides whether it was gunfire. Most loud, sharp
 * sounds in a city are not gunshots, which is the whole problem.
 */
import { BLOCK_H, BLOCK_W, districtAt, HEIGHT, WIDTH } from './city';
import { hash, Rng } from './rng';
import { at, weekday } from './time';
import type { World } from './world';

export type SoundKind = 'gunfire' | 'fireworks' | 'backfire' | 'construction' | 'dumpster';

export const SOUND_LABEL: Record<SoundKind, string> = {
  gunfire: 'Gunfire',
  fireworks: 'Fireworks',
  backfire: 'Car backfire',
  construction: 'Nail gun (construction)',
  dumpster: 'Dumpster lid',
};

export interface SoundEvent {
  id: string;
  t: number;
  x: number;
  y: number;
  kind: SoundKind;
  /** Bangs in the burst. */
  rounds: number;
  /** Classifier's probability that it was gunfire, 0–1. */
  score: number;
  /** Microphones within range. */
  heardBy: number[];
  /** Where the system places it. */
  est: { x: number; y: number };
  scripted?: string;
}

export const HEARING_RANGE = 520;
/** Sensors needed to locate a sound. */
export const MIN_SENSORS = 3;
/** The vendor's alert threshold. */
export const ALERT_AT = 0.5;

const HOURLY: Record<SoundKind, (minute: number, day: number) => number> = {
  gunfire: () => 0.035,
  fireworks: (m, d) => {
    const evening = m >= 19 * 60 && m < 23 * 60 + 30;
    const weekend = weekday(d) === 5 || weekday(d) === 6;
    return evening ? (weekend ? 1.2 : 0.25) : 0.03;
  },
  backfire: (m) => (m > 360 && m < 1380 ? 0.35 : 0.08),
  construction: (m, d) => (weekday(d) >= 1 && weekday(d) <= 5 && m >= 480 && m < 960 ? 1.4 : 0),
  dumpster: (m) => (m >= 300 && m < 600 ? 0.5 : 0.1),
};

const SCORE: Record<SoundKind, [number, number]> = {
  gunfire: [0.86, 0.07],
  fireworks: [0.66, 0.15],
  backfire: [0.56, 0.15],
  construction: [0.47, 0.14],
  dumpster: [0.4, 0.14],
};

const ROUNDS: Record<SoundKind, [number, number]> = {
  gunfire: [1, 6],
  fireworks: [4, 14],
  backfire: [1, 2],
  construction: [3, 8],
  dumpster: [1, 2],
};

function hearers(world: World, x: number, y: number): number[] {
  return world.city.sensors.filter((s) => Math.hypot(s.x - x, s.y - y) <= HEARING_RANGE).map((s) => s.id);
}

function makeEvent(world: World, id: string, t: number, x: number, y: number, kind: SoundKind, rng: Rng, score?: number, rounds?: number): SoundEvent {
  const [mu, sd] = SCORE[kind];
  const [rlo, rhi] = ROUNDS[kind];
  const heardBy = hearers(world, x, y);
  return {
    id,
    t,
    x,
    y,
    kind,
    rounds: rounds ?? rng.int(rlo, rhi),
    score: score ?? Math.min(0.99, Math.max(0.02, mu + rng.normal() * sd)),
    heardBy,
    est: { x: x + rng.normal() * 14, y: y + rng.normal() * 14 },
  };
}

/** Scripted sounds for the shift's "shots fired" case, on day `day`. */
export function scriptedSounds(world: World, day: number): SoundEvent[] {
  const rng = new Rng(hash(world.seed, 'scripted-sounds'));
  const E = (h: number, m: number, x: number, y: number, kind: SoundKind, score: number, rounds: number, tag: string) => {
    const e = makeEvent(world, `S-${tag}`, at(day, h, m), x * BLOCK_W, y * BLOCK_H, kind, rng, score, rounds);
    e.scripted = tag;
    return e;
  };
  return [
    E(19, 41, 9.55, 1.45, 'fireworks', 0.91, 9, 'birthday'),
    E(19, 47, 10.7, 4.3, 'backfire', 0.64, 2, 'backfire'),
    E(19, 52, 8.6, 2.55, 'gunfire', 0.94, 3, 'real'),
    E(19, 58, 9.3, 3.6, 'fireworks', 0.61, 6, 'relabel'),
  ];
}

/** Every loud impulsive sound in the city on one day (whether or not anything heard it). */
export function soundsForDay(world: World, day: number, withScript: boolean): SoundEvent[] {
  const out: SoundEvent[] = [];
  const kinds = Object.keys(HOURLY) as SoundKind[];
  for (let hour = 0; hour < 24; hour++) {
    for (const kind of kinds) {
      const rate = HOURLY[kind](hour * 60 + 30, day);
      const rng = new Rng(hash(world.seed, 'sound', day, hour, kind));
      // Poisson by thinning
      let n = 0;
      const L = Math.exp(-rate);
      let p = rng.next();
      while (p > L && n < 12) {
        n++;
        p *= rng.next();
      }
      for (let k = 0; k < n; k++) {
        let x = 0;
        let y = 0;
        do {
          x = rng.range(40, WIDTH - 40);
          y = rng.range(30, HEIGHT - 30);
        } while (districtAt(x, y) === null);
        const t = at(day, hour, rng.range(0, 59.9));
        out.push(makeEvent(world, `${day}-${hour}-${kind}-${k}`, t, x, y, kind, rng));
      }
    }
  }
  if (withScript) out.push(...scriptedSounds(world, day));
  return out.sort((a, b) => a.t - b.t);
}

export function detected(e: SoundEvent): boolean {
  return e.heardBy.length >= MIN_SENSORS;
}

export function isAlert(e: SoundEvent): boolean {
  return detected(e) && e.score >= ALERT_AT;
}

export function alertLabel(e: SoundEvent): string {
  return e.score >= 0.8 ? 'Probable gunfire' : 'Possible gunfire';
}

/**
 * The base rate problem: of the alerts a sensor network raises, how many are
 * gunshots? With a sensitivity and specificity and the share of loud impulsive
 * sounds that really are gunfire, Bayes' rule gives the answer.
 */
export function precision(prevalence: number, sensitivity: number, specificity: number): number {
  const tp = prevalence * sensitivity;
  const fp = (1 - prevalence) * (1 - specificity);
  return tp + fp === 0 ? 0 : tp / (tp + fp);
}

export function districtOfSound(e: SoundEvent): string {
  return districtAt(e.x, e.y) ?? 'River';
}
