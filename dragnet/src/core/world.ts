/**
 * The world: city, people, cars and phones, and everything the surveillance
 * systems have recorded about them. Built once from a seed; day plans are
 * computed on demand and kept.
 */
import { buildCast, type Cast, CAST_SURNAMES, finishCast } from './cast';
import { buildCity, type City } from './city';
import { buildPopulation, type Person, type Vehicle } from './people';
import { hash, unit } from './rng';
import { buildPlan, type DayPlan, type PlanContext, positionIn, type Position, type ScriptDay, type Trip } from './schedule';
import { dayOf, HISTORY_DAYS, MIN_PER_DAY, TODAY } from './time';

export const DEFAULT_SEED = 20261023;

export interface Read {
  vehicle: number;
  camera: number;
  t: number;
  /** What the camera's OCR made of the plate. */
  text: string;
  /** OCR confidence, 0–100. */
  conf: number;
}

export interface World {
  seed: number;
  city: City;
  people: Person[];
  vehicles: Vehicle[];
  cast: Cast;
  ctx: PlanContext;
  plan(person: number, day: number): DayPlan;
  positionAt(person: number, t: number): Position;
  /** The car trips a vehicle made that day, whoever drove. */
  vehicleTrips(vehicle: number, day: number): Trip[];
  /** Who has the car at time t. */
  driverAt(vehicle: number, t: number): number;
  /** Every plate read, in time order, including today's not-yet-happened ones (callers clip to "now"). */
  reads: Read[];
  plateIndex: Map<string, number>;
}

const OCR_CONFUSIONS: Record<string, string[]> = {
  '0': ['O', 'D', '8'], O: ['0', 'D', 'Q'], D: ['0', 'O'], '8': ['B', '3'], B: ['8', 'R'], '1': ['I', '7', 'L'],
  '7': ['1', 'T'], '5': ['S'], S: ['5'], '2': ['Z'], Z: ['2'], M: ['H', 'N'], H: ['M', 'N'], N: ['M', 'H'],
  '6': ['G', '8'], G: ['6', 'C'], C: ['G', '0'], U: ['V'], V: ['U', 'Y'], K: ['X'], '3': ['8'], '4': ['A'], A: ['4'],
};

/** What a plate reader might read instead of the true plate. */
export function misread(plate: string, h: number): string {
  const chars = plate.split('');
  const candidates = chars.map((c, k) => (OCR_CONFUSIONS[c] ? k : -1)).filter((k) => k >= 0);
  if (candidates.length === 0) return plate;
  const k = candidates[h % candidates.length] as number;
  const options = OCR_CONFUSIONS[chars[k] as string] as string[];
  chars[k] = options[(h >>> 8) % options.length] as string;
  return chars.join('');
}

export function buildWorld(seed = DEFAULT_SEED): World {
  const city = buildCity(seed);
  const cast = buildCast(city, seed);
  const { people, vehicles } = buildPopulation(city, seed, { people: cast.people, vehicles: cast.vehicles }, CAST_SURNAMES);
  finishCast(cast, city, people, vehicles, seed);

  const scripts = cast.scripts;
  const ctx: PlanContext = {
    seed,
    city,
    people,
    vehicles,
    script(p: Person, day: number): ScriptDay | undefined {
      return scripts.get(p.id)?.get(day);
    },
    carAvailable(p: Person, t: number): boolean {
      if (p.vehicle === null) return false;
      const v = vehicles[p.vehicle] as Vehicle;
      if (!v.takenBy) return true;
      return p.id === v.takenBy.person ? t >= v.takenBy.at : t < v.takenBy.at;
    },
  };

  const plans = new Map<number, DayPlan>();
  const plan = (person: number, day: number): DayPlan => {
    const key = person * 64 + day;
    let p = plans.get(key);
    if (!p) {
      p = buildPlan(ctx, people[person] as Person, day);
      plans.set(key, p);
    }
    return p;
  };

  const driverAt = (vehicle: number, t: number): number => {
    const v = vehicles[vehicle] as Vehicle;
    return v.takenBy && t >= v.takenBy.at ? v.takenBy.person : v.owner;
  };

  const vehicleTrips = (vehicle: number, day: number): Trip[] => {
    const v = vehicles[vehicle] as Vehicle;
    const own = plan(v.owner, day).trips.filter((t) => t.mode === 'car' && (!v.takenBy || t.depart < v.takenBy.at));
    if (!v.takenBy) return own;
    const taken = v.takenBy;
    const theirs = plan(taken.person, day).trips.filter((t) => t.mode === 'car' && t.depart >= taken.at);
    return [...own, ...theirs].sort((a, b) => a.depart - b.depart);
  };

  // Every plate read for the retention window and today.
  const reads: Read[] = [];
  const ocrOverride = new Map(cast.ocr.map((o) => [`${o.vehicle}:${o.camera}:${o.day}`, o]));
  for (const v of vehicles) {
    for (let day = TODAY - HISTORY_DAYS; day <= TODAY; day++) {
      for (const trip of vehicleTrips(v.id, day)) {
        trip.nodes.forEach((node, k) => {
          const camera = city.cameraAtNode[node] as number;
          if (camera < 0) return;
          const t = trip.times[k] as number;
          const h = hash(seed, 'read', v.id, Math.floor(t * 10), camera);
          const minute = t - Math.floor(t / MIN_PER_DAY) * MIN_PER_DAY;
          const night = minute < 360 || minute > 1200;
          const key = `${v.id}:${camera}:${day}`;
          const override = ocrOverride.get(key);
          ocrOverride.delete(key);
          let text = v.plate;
          let conf = 88 + (h % 12);
          if (override) {
            text = override.text;
            conf = override.conf;
          } else if (unit(seed, 'ocr', h) < (night ? 0.05 : 0.02)) {
            text = misread(v.plate, h);
            conf = 58 + (h % 25);
          } else if (night) {
            conf -= 6;
          }
          reads.push({ vehicle: v.id, camera, t, text, conf });
        });
      }
    }
  }
  reads.sort((a, b) => a.t - b.t);

  const plateIndex = new Map(vehicles.map((v) => [v.plate, v.id]));

  return {
    seed,
    city,
    people,
    vehicles,
    cast,
    ctx,
    plan,
    positionAt(person: number, t: number): Position {
      return positionIn(plan(person, dayOf(t)), city.places, t);
    },
    vehicleTrips,
    driverAt,
    reads,
    plateIndex,
  };
}

/** Index of the first read at or after t (reads are sorted by time). */
export function readsFrom(world: World, t: number): number {
  let lo = 0;
  let hi = world.reads.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((world.reads[mid] as Read).t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
