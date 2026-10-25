/**
 * Phone location data of the kind apps collect and data brokers resell: an
 * advertising ID and a stream of GPS points. It's sold as "anonymous". It
 * isn't: the place a phone spends its nights is a home address, and a home
 * address is a name.
 */
import type { Place } from './city';
import { homeOn, type Person } from './people';
import { unit } from './rng';
import { tripPosition } from './schedule';
import { dayOf, MIN_PER_DAY, minuteOfDay } from './time';
import type { World } from './world';

export interface Ping {
  t: number;
  x: number;
  y: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function normRect(r: Rect): Rect {
  return { x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) };
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

const STILL_STEP = 6;

export function sharesLocation(p: Person): boolean {
  return p.phone.carried && p.phone.apps && !p.hidden;
}

/** The GPS points a person's apps reported between t0 and t1. */
export function pings(world: World, person: number, t0: number, t1: number): Ping[] {
  const p = world.people[person] as Person;
  if (!sharesLocation(p)) return [];
  const out: Ping[] = [];
  const seed = world.seed;
  const places = world.city.places;
  for (let day = dayOf(t0); day <= dayOf(t1 - 1e-6); day++) {
    const plan = world.plan(person, day);
    plan.stops.forEach((s, k) => {
      const a = Math.max(s.start, t0);
      const b = Math.min(s.end, t1);
      if (b > a) {
        const place = places[s.place] as Place;
        if (place.kind !== 'outside') {
          for (let slot = Math.floor(a / STILL_STEP); slot * STILL_STEP < b; slot++) {
            if (unit(seed, 'ping', person, slot) > 0.55) continue;
            const t = slot * STILL_STEP + unit(seed, 'pt', person, slot) * STILL_STEP;
            if (t < a || t >= b) continue;
            out.push({ t, x: place.x + (unit(seed, 'px', person, slot) - 0.5) * 30, y: place.y + (unit(seed, 'py', person, slot) - 0.5) * 30 });
          }
        }
      }
      const trip = plan.trips[k];
      if (!trip) return;
      const ta = Math.max(trip.depart, t0);
      const tb = Math.min(trip.arrive, t1);
      if (tb <= ta) return;
      const step = trip.mode === 'bike' && p.phone.fitness ? 0.25 : 1;
      for (let t = Math.ceil(ta / step) * step; t < tb; t += step) {
        const slot = Math.round(t * 4);
        if (step === 1 && unit(seed, 'mp', person, slot) > 0.8) continue;
        const pos = tripPosition(trip, t);
        out.push({ t, x: pos.x + (unit(seed, 'mx', person, slot) - 0.5) * 18, y: pos.y + (unit(seed, 'my', person, slot) - 0.5) * 18 });
      }
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

export interface Device {
  person: number;
  adId: string;
  /** Pings inside the area. */
  inside: Ping[];
  first: number;
  last: number;
  /** Separate passes: times the device reported from inside after reporting from outside. */
  visits: number;
}

/**
 * A geofence: every device that reported a location inside the rectangle
 * during the window. This is the whole idea of a "reverse" search: start from
 * a place and a time, get back everyone who was there.
 */
export function geofence(world: World, rect: Rect, t0: number, t1: number): Device[] {
  const r = normRect(rect);
  const out: Device[] = [];
  for (const p of world.people) {
    if (!sharesLocation(p)) continue;
    const all = pings(world, p.id, t0, t1);
    const inside: Ping[] = [];
    let visits = 0;
    let wasIn = false;
    for (const g of all) {
      const isIn = inRect(r, g.x, g.y);
      if (isIn) {
        inside.push(g);
        if (!wasIn) visits++;
      }
      wasIn = isIn;
    }
    if (inside.length === 0) continue;
    out.push({ person: p.id, adId: p.phone.adId, inside, first: (inside[0] as Ping).t, last: (inside[inside.length - 1] as Ping).t, visits });
  }
  return out.sort((a, b) => b.inside.length - a.inside.length);
}

export interface BedDown {
  place: Place;
  nights: number;
  of: number;
}

/**
 * Where a device sleeps: the place it reports from most often between 1 and
 * 5 a.m. Researchers showed in 2013 that four points in time and space are
 * enough to single out 95% of people in a phone location dataset.
 */
export function bedDown(world: World, person: number, now: number, nights = 14): BedDown | null {
  const tally = new Map<number, number>();
  let of = 0;
  const today = dayOf(now);
  for (let d = today - nights; d < today + (minuteOfDay(now) > 300 ? 1 : 0); d++) {
    const night = pings(world, person, d * MIN_PER_DAY + 60, d * MIN_PER_DAY + 300);
    if (night.length === 0) continue;
    of++;
    const counts = new Map<number, number>();
    for (const g of night) {
      const place = nearestPlace(world, g.x, g.y);
      if (place) counts.set(place.id, (counts.get(place.id) ?? 0) + 1);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) tally.set(best[0], (tally.get(best[0]) ?? 0) + 1);
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  return { place: world.city.places[top[0]] as Place, nights: top[1], of };
}

export function nearestPlace(world: World, x: number, y: number, within = 45): Place | null {
  let best: Place | null = null;
  let bestD = within;
  for (const p of world.city.places) {
    if (p.kind === 'outside') continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Who the property records say lives at a place. */
export function householdAt(world: World, place: number, day: number): Person[] {
  return world.people.filter((p) => !p.hidden && p.resident && homeOn(p, day) === place);
}
