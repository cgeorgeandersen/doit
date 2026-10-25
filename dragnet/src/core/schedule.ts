/**
 * A person's day: where they are and how they get between places, built
 * fresh from hashes of (person, day) every time it's asked for, so any day can
 * be computed on its own. A day runs from midnight to midnight; it starts
 * wherever the person slept and ends wherever they will sleep.
 */
import { BLOCK_W, type City, edgeLength, nodeXY, type Place, route } from './city';
import { homeOn, type Person, SHIFT_HOURS, type Vehicle } from './people';
import { unit } from './rng';
import { MIN_PER_DAY, weekday } from './time';

export type Mode = 'car' | 'walk' | 'bus' | 'bike';

export interface Stop {
  place: number;
  start: number;
  end: number;
  label: string;
}

export interface Trip {
  mode: Mode;
  depart: number;
  arrive: number;
  /** Intersections passed, with the time at each. */
  nodes: number[];
  times: number[];
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** A ride that starts and ends at the same place (a workout loop, a mail route). */
  loop?: boolean;
}

/** stops[0], trips[0], stops[1], trips[1] … stops[n]. */
export interface DayPlan {
  person: number;
  day: number;
  stops: Stop[];
  trips: Trip[];
}

export interface Activity {
  place: number;
  start: number;
  end: number;
  label: string;
  priority: number;
  /** A round trip through these intersections instead of a visit. */
  loop?: number[];
  /** Go by way of these intersections. */
  via?: number[];
  mode?: Mode;
}

/** What a scripted character does on a given day, on top of (or instead of) their habits. */
export interface ScriptDay {
  acts?: Activity[];
  /** Skip work and habits entirely. */
  replace?: boolean;
  /** Where they sleep tonight. */
  end?: number;
}

export interface PlanContext {
  seed: number;
  city: City;
  people: Person[];
  vehicles: Vehicle[];
  script(person: Person, day: number): ScriptDay | undefined;
  /** False once the car is stolen, say. */
  carAvailable(person: Person, t: number): boolean;
}

const SPEED: Record<Mode, number> = { car: 420, walk: 75, bus: 210, bike: 290 };
const BUS_WAIT = 6;

export function worksOn(ctx: PlanContext, p: Person, day: number): boolean {
  if (!p.job) return false;
  if (!p.resident) return (p.visitDays ?? []).includes(day);
  if (!p.job.days.includes(weekday(day))) return false;
  return unit(ctx.seed, 'sick', p.id, day) > 0.03;
}

/** Whether a couple who live apart spend tonight together, and at whose place. */
function stayOver(ctx: PlanContext, p: Person, day: number): number | null {
  if (p.partner === null) return null;
  const other = ctx.people[p.partner] as Person;
  for (const q of [p, other]) if (q.job?.shift === 'night' && worksOn(ctx, q, day)) return null;
  const lo = Math.min(p.id, other.id);
  const hi = Math.max(p.id, other.id);
  const w = weekday(day);
  const chance = w === 5 || w === 6 ? 0.55 : 0.12;
  if (unit(ctx.seed, 'stay', lo, day) >= chance) return null;
  const host = unit(ctx.seed, 'host', lo, day) < 0.5 ? lo : hi;
  return homeOn(ctx.people[host] as Person, day);
}

/** Where the person sleeps the night that starts on `day`. */
export function nightPlace(ctx: PlanContext, p: Person, day: number): number {
  const scripted = ctx.script(p, day)?.end;
  if (scripted !== undefined) return scripted;
  if (!p.resident) return homeOn(p, day);
  if (p.job?.shift === 'night' && worksOn(ctx, p, day)) return p.job.place;
  return stayOver(ctx, p, day) ?? homeOn(p, day);
}

function weekIndex(day: number): number {
  return Math.floor(day / 7);
}

function collectActivities(ctx: PlanContext, p: Person, day: number, startPlace: number): Activity[] {
  const base = day * MIN_PER_DAY;
  const jitter = (tag: string, spread: number) => (unit(ctx.seed, tag, p.id, day) - 0.5) * 2 * spread;
  const script = ctx.script(p, day);
  const acts: Activity[] = [...(script?.acts ?? [])];
  if (script?.replace) return acts;

  if (!p.resident) {
    if (p.job && worksOn(ctx, p, day)) {
      const start = base + 540 + jitter('visit-in', 90);
      acts.push({ place: p.job.place, start, end: start + 120 + unit(ctx.seed, 'visit-len', p.id, day) * 300, label: 'visit', priority: 5 });
    }
    return acts;
  }

  const job = p.job;
  if (job) {
    const [s, e] = SHIFT_HOURS[job.shift];
    if (job.shift === 'night') {
      // Coming off last night's shift, and maybe starting tonight's.
      if (startPlace === job.place) acts.push({ place: job.place, start: base, end: base + (e - MIN_PER_DAY) + jitter('off', 12), label: 'night shift', priority: 6 });
      if (worksOn(ctx, p, day)) acts.push({ place: job.place, start: base + s - 10 + jitter('on', 8), end: base + MIN_PER_DAY, label: 'night shift', priority: 6 });
    } else if (worksOn(ctx, p, day)) {
      acts.push({ place: job.place, start: base + s + jitter('in', 14), end: base + e + jitter('out', 20), label: 'work', priority: 5 });
    }
  }

  p.routines.forEach((r, k) => {
    const eligible = r.onDays ? r.onDays.includes(day) : r.days.includes(weekday(day));
    if (!eligible) return;
    if (r.weeks && (weekIndex(day) % 2 === 0) !== (r.weeks === 'even')) return;
    if (unit(ctx.seed, 'routine', p.id, day, k) >= r.prob) return;
    const start = base + r.start + jitter(`r${k}`, 10);
    acts.push({ place: r.place, start, end: start + r.duration, label: r.label, priority: r.label === 'groceries' ? 1 : 3 });
  });

  const tonight = nightPlace(ctx, p, day);
  if (tonight !== homeOn(p, day) && tonight !== job?.place) {
    const start = base + 1230 + jitter('over', 60);
    acts.push({ place: tonight, start, end: base + MIN_PER_DAY, label: 'overnight', priority: 4 });
  }
  return acts;
}

/** Drops whatever collides with something more important. */
function resolve(acts: Activity[]): Activity[] {
  const sorted = [...acts].sort((a, b) => a.start - b.start);
  const kept: Activity[] = [];
  for (const act of sorted) {
    const clash = kept.findIndex((k) => {
      const gap = act.priority >= 9 || k.priority >= 9 ? 0 : 10;
      return act.start < k.end + gap && k.start < act.end + gap && k.place !== act.place;
    });
    if (clash === -1) {
      kept.push(act);
      continue;
    }
    const other = kept[clash] as Activity;
    if (act.priority > other.priority) {
      // Cut the earlier one short if that leaves something of it; otherwise drop it.
      if (other.start < act.start - 30) other.end = act.start - 20;
      else kept.splice(clash, 1);
      kept.push(act);
    }
  }
  return kept.sort((a, b) => a.start - b.start);
}

interface Leg {
  nodes: number[];
  meters: number[];
  total: number;
}

function leg(ctx: PlanContext, habit: number, from: Place, to: Place, via?: number[]): Leg {
  let nodes: number[];
  if (via && via.length > 0) {
    nodes = route(ctx.city, from.node, via[0] as number, habit);
    for (let k = 1; k < via.length; k++) nodes = nodes.concat(route(ctx.city, via[k - 1] as number, via[k] as number, habit).slice(1));
    nodes = nodes.concat(route(ctx.city, via[via.length - 1] as number, to.node, habit).slice(1));
  } else {
    nodes = route(ctx.city, from.node, to.node, habit);
  }
  const first = nodeXY(nodes[0] as number);
  let dist = Math.abs(first.x - from.x) + Math.abs(first.y - from.y);
  const meters = [dist];
  for (let k = 1; k < nodes.length; k++) {
    dist += edgeLength(nodes[k - 1] as number, nodes[k] as number);
    meters.push(dist);
  }
  const last = nodeXY(nodes[nodes.length - 1] as number);
  return { nodes, meters, total: dist + Math.abs(last.x - to.x) + Math.abs(last.y - to.y) };
}

function travelMinutes(l: Leg, mode: Mode): number {
  return l.total / SPEED[mode] + (mode === 'bus' ? BUS_WAIT : 0) + (mode === 'car' ? 1 : 0);
}

function chooseMode(ctx: PlanContext, p: Person, t: number, l: Leg, wanted?: Mode): Mode {
  if (wanted) return wanted;
  if (p.vehicle !== null && ctx.carAvailable(p, t)) return 'car';
  return l.total < 5.5 * BLOCK_W ? 'walk' : 'bus';
}

function makeTrip(l: Leg, mode: Mode, depart: number, from: Place, to: Place, loop = false): Trip {
  const start = depart + (mode === 'bus' ? BUS_WAIT : 0);
  const speed = SPEED[mode];
  return {
    mode,
    depart,
    arrive: depart + travelMinutes(l, mode),
    nodes: l.nodes,
    times: l.meters.map((m) => start + m / speed),
    from: { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
    loop,
  };
}

export function buildPlan(ctx: PlanContext, p: Person, day: number): DayPlan {
  const places = ctx.city.places;
  const base = day * MIN_PER_DAY;
  const end = base + MIN_PER_DAY;
  const startPlace = nightPlace(ctx, p, day - 1);
  const endPlace = nightPlace(ctx, p, day);
  const home = homeOn(p, day);
  const acts = resolve(collectActivities(ctx, p, day, startPlace));

  const stops: Stop[] = [];
  const trips: Trip[] = [];
  let here = startPlace;
  let since = base;
  let label = here === home ? 'home' : 'overnight';
  // Someone who slept elsewhere doesn't leave before morning.
  // (Unless something early in the day needs them sooner.)
  const wake = base + 400 + unit(ctx.seed, 'wake', p.id, day) * 70;
  const firstAct = acts[0]?.start ?? end;
  let free = here === home || places[here]?.kind === 'outside' ? base : Math.max(base, Math.min(wake, firstAct - 60));

  const go = (to: number, depart: number, mode?: Mode, via?: number[]): number => {
    const from = places[here] as Place;
    const dest = places[to] as Place;
    const l = leg(ctx, p.habit, from, dest, via);
    const m = chooseMode(ctx, p, depart, l, mode);
    const trip = makeTrip(l, m, depart, from, dest, to === here);
    stops.push({ place: here, start: since, end: depart, label });
    trips.push(trip);
    here = to;
    since = trip.arrive;
    return trip.arrive;
  };

  const minutesTo = (to: number, t: number, mode?: Mode): number => {
    const l = leg(ctx, p.habit, places[here] as Place, places[to] as Place);
    return travelMinutes(l, chooseMode(ctx, p, t, l, mode));
  };

  for (const act of acts) {
    if (act.loop) {
      if (act.start < free) continue;
      go(here, act.start, act.mode, act.loop);
      label = here === home ? 'home' : label;
      free = since;
      continue;
    }
    if (act.place === here) {
      free = Math.max(free, act.end);
      if (act.start <= since + 1) label = act.label;
      continue;
    }
    // A long gap between two places that aren't home: go home in between.
    if (here !== home && act.place !== home && places[home]?.kind !== 'outside') {
      const toHome = minutesTo(home, free);
      const fromHome = travelHomeTo(ctx, p, home, act.place, free);
      if (act.start - free > toHome + fromHome + 15) {
        go(home, free);
        label = 'home';
        free = since + 1;
      }
    }
    const trav = minutesTo(act.place, Math.max(free, act.start - 30), act.mode);
    const depart = Math.max(free, act.start - trav);
    if (depart + trav > act.end - 5) continue;
    go(act.place, depart, act.mode, act.via);
    label = act.label;
    free = act.end;
  }

  if (here !== endPlace) {
    const trav = minutesTo(endPlace, free);
    const depart = Math.min(Math.max(free, since + 1), end - trav - 1);
    if (depart > since) {
      go(endPlace, depart);
      label = endPlace === home ? 'home' : 'overnight';
    }
  }
  stops.push({ place: here, start: since, end, label });
  return { person: p.id, day, stops, trips };
}

function travelHomeTo(ctx: PlanContext, p: Person, home: number, to: number, t: number): number {
  const l = leg(ctx, p.habit, ctx.city.places[home] as Place, ctx.city.places[to] as Place);
  return travelMinutes(l, chooseMode(ctx, p, t, l));
}

export interface Position {
  x: number;
  y: number;
  /** Set while the person is at a place. */
  place: number | null;
  moving: Mode | null;
  /** Heading in radians, while moving. */
  heading: number;
}

/** Where a trip has got to at time t. */
export function tripPosition(trip: Trip, t: number): { x: number; y: number; heading: number } {
  const pts: { x: number; y: number }[] = [trip.from];
  const times: number[] = [trip.depart + (trip.mode === 'bus' ? BUS_WAIT : 0)];
  trip.nodes.forEach((n, k) => {
    pts.push(nodeXY(n));
    times.push(trip.times[k] as number);
  });
  pts.push(trip.to);
  times.push(trip.arrive);
  if (t <= (times[0] as number)) return { ...trip.from, heading: 0 };
  for (let k = 1; k < pts.length; k++) {
    const t1 = times[k] as number;
    if (t <= t1) {
      const t0 = times[k - 1] as number;
      const a = pts[k - 1] as { x: number; y: number };
      const b = pts[k] as { x: number; y: number };
      const f = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
      // Manhattan legs between a place and its corner: go along x, then y.
      if (a.x !== b.x && a.y !== b.y) {
        const dx = Math.abs(b.x - a.x);
        const dy = Math.abs(b.y - a.y);
        const along = f * (dx + dy);
        if (along <= dx) return { x: a.x + Math.sign(b.x - a.x) * along, y: a.y, heading: Math.atan2(0, b.x - a.x) };
        return { x: b.x, y: a.y + Math.sign(b.y - a.y) * (along - dx), heading: Math.atan2(b.y - a.y, 0) };
      }
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, heading: Math.atan2(b.y - a.y, b.x - a.x) };
    }
  }
  return { ...trip.to, heading: 0 };
}

export function positionIn(plan: DayPlan, places: Place[], t: number): Position {
  for (let k = 0; k < plan.stops.length; k++) {
    const s = plan.stops[k] as Stop;
    if (t >= s.start && t < s.end) {
      const place = places[s.place] as Place;
      return { x: place.x, y: place.y, place: s.place, moving: null, heading: 0 };
    }
    const trip = plan.trips[k];
    if (trip && t >= trip.depart && t < trip.arrive) {
      const pos = tripPosition(trip, t);
      return { ...pos, place: null, moving: trip.mode };
    }
  }
  const last = plan.stops[plan.stops.length - 1] as Stop;
  const place = places[last.place] as Place;
  return { x: place.x, y: place.y, place: last.place, moving: null, heading: 0 };
}
