/**
 * Fusion: everything the systems hold on one person, joined up. No single
 * source here says "she's in recovery" or "he sleeps at his girlfriend's on
 * weekends". Location over time says it for them. The inferences below are
 * the kind analysts draw, and they are often right, which is the problem,
 * and sometimes wrong, which is another one.
 */
import { convoy, searchPlate } from './alpr';
import type { Place, Sensitive } from './city';
import { pings, sharesLocation } from './location';
import { fullName, homeOn, type Person, type Vehicle } from './people';
import type { Post } from './social';
import { dayOf, HISTORY_DAYS, MIN_PER_DAY, minuteOfDay, weekday } from './time';
import type { World } from './world';

export interface Visit {
  place: Place;
  days: number[];
  minutes: number;
  /** Typical arrival, minute of day. */
  typical: number;
  weekdays: number[];
}

export interface Inference {
  text: string;
  evidence: string;
  tag: Sensitive | 'overnight' | 'routine' | 'home' | 'work';
  place?: Place;
  sensitive: boolean;
}

export interface Associate {
  person: Person;
  how: string;
  weight: number;
}

export type RoutineCode = 0 | 1 | 2 | 3 | 4 | 5;
export const ROUTINE_LABELS = ['no data', 'home', 'work', 'elsewhere', 'sensitive place', 'on the move'] as const;

export interface Dossier {
  person: Person;
  vehicle: Vehicle | null;
  home: Place;
  work: Place | null;
  sources: { plateReads: number; pings: number; posts: number; photos: string[] };
  visits: Visit[];
  overnights: { place: Place; nights: number; hosts: Person[] }[];
  associates: Associate[];
  /** weekday (0 = Sun) × hour → code */
  routine: RoutineCode[][];
  inferences: Inference[];
  threat: 'GREEN' | 'YELLOW' | 'RED';
  threatReasons: string[];
  posts: Post[];
}

/** Public schedules an analyst can match visits against. */
const KNOWN_SCHEDULES: { place: string; weekday: number; minute: number; meeting: string; tag: Sensitive }[] = [
  { place: 'st-brendan', weekday: 3, minute: 1140, meeting: "the Alcoholics Anonymous meeting in St. Brendan's basement", tag: 'addiction' },
  { place: 'union-hall', weekday: 4, minute: 1140, meeting: 'the Local 19 membership meeting', tag: 'union' },
];

/** Last Saturday's rally at City Hall. */
const RALLY_DAY_OFFSET = 6;

const PUBLIC_KINDS = new Set(['shop', 'transit', 'park', 'school', 'civic', 'parking', 'outside', 'bar', 'gym', 'health', 'religion']);

const TAG_TEXT: Partial<Record<Sensitive, (v: Visit) => string>> = {
  reproductive: (v) => `Visited a reproductive health clinic (${v.place.name}) ${times(v)}`,
  'mental-health': (v) => `Sees a psychiatrist: ${v.place.name}, ${times(v)}`,
  addiction: (v) => `Visits an addiction treatment provider (${v.place.name}) ${times(v)}`,
  immigration: (v) => `Visits an immigration legal aid office ${times(v)}: possible immigration matter`,
  sexuality: (v) => `Goes to an LGBTQ bar (${v.place.name}) ${times(v)}`,
  shelter: (v) => `Stays at ${v.place.address}, a confidential address (domestic violence shelter)`,
  union: (v) => `Attends meetings at the union hall ${times(v)}`,
  guns: (v) => `Visits a gun shop and range ${times(v)}`,
  cannabis: (v) => `Buys from a cannabis dispensary ${times(v)}`,
  religion: (v) => `Worships at ${v.place.name} ${times(v)}`,
  legal: (v) => `Visited ${v.place.name} ${times(v)}`,
  press: (v) => `Visited the offices of ${v.place.name} ${times(v)}: possible media contact`,
  protest: () => `At City Hall during last Saturday's rally against the camera contract`,
  health: (v) => `Medical visits: ${v.place.name}, ${times(v)}`,
};

function times(v: Visit): string {
  const n = v.days.length;
  return n === 1 ? 'once in 30 days' : `${n} times in 30 days`;
}

function code(world: World, p: Person, t: number): RoutineCode {
  const pos = world.positionAt(p.id, t);
  if (pos.moving) return 5;
  if (pos.place === null) return 0;
  if (pos.place === homeOn(p, dayOf(t))) return 1;
  if (p.job && pos.place === p.job.place) return 2;
  const place = world.city.places[pos.place] as Place;
  if (place.kind === 'outside') return 0;
  return place.tags.some((tag) => tag !== 'police') ? 4 : 3;
}

export function buildDossier(world: World, personId: number, now: number, posts: Post[]): Dossier {
  const p = world.people[personId] as Person;
  const today = dayOf(now);
  const first = Math.max(0, today - HISTORY_DAYS);
  const places = world.city.places;
  const home = places[homeOn(p, today)] as Place;
  const work = p.job ? (places[p.job.place] as Place) : null;
  const vehicle = p.vehicle !== null ? (world.vehicles[p.vehicle] as Vehicle) : null;
  const located = sharesLocation(p);

  // Visits, from the fused location record.
  const visits = new Map<number, Visit>();
  const nightAt = new Map<number, number>();
  for (let d = first; d <= today; d++) {
    const plan = world.plan(p.id, d);
    for (const [k, s] of plan.stops.entries()) {
      // Without a phone feed, all the record has is where the car was seen going.
      if (!located && plan.trips[k - 1]?.mode !== 'car') continue;
      const start = Math.max(s.start, d * MIN_PER_DAY);
      const end = Math.min(s.end, now);
      if (end <= start) continue;
      if (s.place === home.id || s.place === homeOn(p, d) || s.place === work?.id) continue;
      const place = places[s.place] as Place;
      if (place.kind === 'outside') continue;
      const v = visits.get(s.place) ?? { place, days: [], minutes: 0, typical: minuteOfDay(start), weekdays: [] };
      if (!v.days.includes(d)) {
        v.days.push(d);
        v.weekdays.push(weekday(d));
      }
      v.minutes += end - start;
      visits.set(s.place, v);
    }
    const t3 = d * MIN_PER_DAY + 180;
    if (t3 <= now && d > first && located) {
      const pos = world.positionAt(p.id, t3);
      if (pos.place !== null && pos.place !== homeOn(p, d) && pos.place !== work?.id) nightAt.set(pos.place, (nightAt.get(pos.place) ?? 0) + 1);
    }
  }
  // Typical arrival = the median arrival.
  for (const v of visits.values()) {
    const arrivals: number[] = [];
    for (const d of v.days) {
      const s = world.plan(p.id, d).stops.find((x) => x.place === v.place.id && x.start >= d * MIN_PER_DAY);
      if (s) arrivals.push(minuteOfDay(s.start));
    }
    arrivals.sort((a, b) => a - b);
    if (arrivals.length) v.typical = arrivals[Math.floor(arrivals.length / 2)] as number;
  }
  const visitList = [...visits.values()].sort((a, b) => b.days.length - a.days.length || b.minutes - a.minutes);

  const overnights = [...nightAt.entries()]
    .map(([place, nights]) => ({
      place: places[place] as Place,
      nights,
      hosts: world.people.filter((q) => !q.hidden && q.resident && q.id !== p.id && homeOn(q, today) === place),
    }))
    .sort((a, b) => b.nights - a.nights);

  // Associates.
  const assoc = new Map<number, { weight: number; reasons: Map<string, number> }>();
  const note = (q: number, reason: string, weight: number) => {
    if (q === p.id || world.people[q]?.hidden) return;
    const a = assoc.get(q) ?? { weight: 0, reasons: new Map<string, number>() };
    a.weight += weight;
    a.reasons.set(reason, (a.reasons.get(reason) ?? 0) + 1);
    assoc.set(q, a);
  };
  for (const o of overnights) for (const h of o.hosts) for (let k = 0; k < o.nights; k++) note(h.id, `spends nights at their home`, 5);
  for (const q of world.people) {
    if (q.hidden || q.id === p.id) continue;
    if (q.resident && homeOn(q, today) === home.id) note(q.id, 'lives at the same address', 6);
  }
  const privateVisits = visitList.filter((v) => !PUBLIC_KINDS.has(v.place.kind) || v.place.tags.length > 0);
  for (const v of privateVisits.slice(0, 12)) {
    for (const d of v.days) {
      const mine = world.plan(p.id, d).stops.filter((s) => s.place === v.place.id);
      for (const q of world.people) {
        if (q.hidden || q.id === p.id) continue;
        if (q.job?.place === v.place.id) continue;
        const theirs = world.plan(q.id, d).stops.filter((s) => s.place === v.place.id);
        const overlap = mine.some((a) => theirs.some((b) => Math.min(a.end, b.end) - Math.max(a.start, b.start) >= 25));
        if (overlap) note(q.id, `together at ${v.place.name}`, v.place.kind === 'home' || v.place.kind === 'apartment' ? 3 : 1);
      }
    }
  }
  let plateReads = 0;
  if (vehicle) {
    const reads = searchPlate(world, vehicle.plate, { from: first * MIN_PER_DAY, to: now }).flatMap((h) => h.reads);
    plateReads = reads.length;
    for (const c of convoy(world, reads, vehicle.id).slice(0, 5)) {
      const owner = (world.vehicles[c.vehicle] as Vehicle).owner;
      for (let k = 0; k < c.days; k++) note(owner, 'their cars travel together', 1);
    }
  }
  const associates: Associate[] = [...assoc.entries()]
    .map(([q, a]) => ({
      person: world.people[q] as Person,
      weight: a.weight,
      how: [...a.reasons.entries()]
        .sort((x, y) => y[1] - x[1])
        .slice(0, 2)
        .map(([r, n]) => (n > 1 ? `${r} (${n}×)` : r))
        .join('; '),
    }))
    .filter((a) => a.weight >= 2)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);

  // Routine: what usually happens at each hour of each weekday.
  const routine: RoutineCode[][] = [];
  for (let w = 0; w < 7; w++) {
    const row: RoutineCode[] = [];
    for (let h = 0; h < 24; h++) {
      const counts = [0, 0, 0, 0, 0, 0];
      for (let d = first; d <= today; d++) {
        if (weekday(d) !== w) continue;
        const t = d * MIN_PER_DAY + h * 60 + 30;
        if (t > now) continue;
        counts[code(world, p, t)]!++;
      }
      let best = 0;
      counts.forEach((c, k) => {
        if (c > (counts[best] as number)) best = k;
      });
      row.push((counts[best] ? best : 0) as RoutineCode);
    }
    routine.push(row);
  }

  // Inferences.
  const inferences: Inference[] = [];
  inferences.push({ text: `Lives at ${home.address}${home.district !== 'Out of town' ? ` (${home.district})` : ''}`, evidence: 'Where the phone spends its nights; matches property records', tag: 'home', sensitive: home.confidential === true });
  if (work) inferences.push({ text: `Works at ${work.name}`, evidence: 'Weekday daytime location', tag: 'work', sensitive: false });
  for (const v of visitList) {
    for (const ks of KNOWN_SCHEDULES) {
      if (places[v.place.id]?.key !== ks.place) continue;
      const matching = v.days.filter((d) => {
        const s = world.plan(p.id, d).stops.find((x) => x.place === v.place.id);
        return s && weekday(d) === ks.weekday && Math.abs(minuteOfDay(s.start) - ks.minute) < 25;
      });
      if (matching.length >= 2)
        inferences.push({
          text: `Attends what looks like ${ks.meeting}`,
          evidence: `At ${v.place.name} on ${matching.length} ${weekdayName(ks.weekday)}s around ${hhmm(ks.minute)}, the meeting's posted time`,
          tag: ks.tag,
          place: v.place,
          sensitive: true,
        });
    }
    for (const tag of v.place.tags) {
      const make = TAG_TEXT[tag];
      if (!make || tag === 'police') continue;
      if (tag === 'health' && v.place.tags.length > 1) continue;
      if (tag === 'protest') continue;
      if (tag === 'legal' && v.place.tags.includes('immigration')) continue;
      inferences.push({ text: make(v), evidence: `Location record: ${v.days.length} day(s), typically arriving ${hhmm(v.typical)}`, tag, place: v.place, sensitive: true });
    }
  }
  // The rally: City Hall during the protest, even for people who work there.
  const rallyDay = today - RALLY_DAY_OFFSET;
  const cityHall = world.city.byKey.get('city-hall') as Place;
  for (let m = 11 * 60; m <= 12 * 60 + 30 && located; m += 15) {
    const t = rallyDay * MIN_PER_DAY + m;
    if (t > now) break;
    if (world.positionAt(p.id, t).place === cityHall.id) {
      inferences.push({ text: `At City Hall during last Saturday's rally against the camera contract`, evidence: `Location record at City Hall Saturday around ${hhmm(m)}`, tag: 'protest', place: cityHall, sensitive: true });
      break;
    }
  }
  for (const o of overnights) {
    if (o.place.confidential) continue;
    if (o.nights < 2) continue;
    const who = o.hosts.length ? `, home of ${o.hosts.map(fullName).join(' and ')}` : '';
    inferences.push({ text: `Spends nights at ${o.place.address}${who}`, evidence: `Phone there at 3 a.m. on ${o.nights} of the last ${HISTORY_DAYS} nights`, tag: 'overnight', place: o.place, sensitive: true });
  }
  if (home.confidential) {
    inferences.push({ text: `Stays at ${home.address}, a confidential address (domestic violence shelter)`, evidence: 'Where the phone and car spend every night since a recent move', tag: 'shelter', place: home, sensitive: true });
  }

  const myPosts = posts.filter((x) => x.author === p.id);
  const threatReasons: string[] = [];
  let points = 0;
  const bump = (n: number, why: string) => {
    points += n;
    threatReasons.push(why);
  };
  if (p.mugshot) bump(2, 'Prior booking on file');
  if (inferences.some((i) => i.tag === 'protest')) bump(2, 'Present at a protest');
  if (myPosts.some((x) => x.kind === 'organizing')) bump(1, 'Posts about protest activity');
  if (inferences.some((i) => i.tag === 'immigration')) bump(1, 'Immigration-related location');
  if (inferences.some((i) => i.tag === 'union')) bump(1, 'Union activity');
  if (inferences.some((i) => i.tag === 'guns')) bump(1, 'Firearms-related location');
  if (inferences.some((i) => i.tag === 'press')) bump(1, 'Contact with media');
  if (home.district === 'Eastside') bump(1, 'Lives in a high-call-volume area');
  const threat = points >= 5 ? 'RED' : points >= 2 ? 'YELLOW' : 'GREEN';

  const photos: string[] = [];
  if (p.license && p.resident) photos.push('DMV photo');
  if (p.mugshot) photos.push(`Booking photo${p.mugshotNote ? ` (${p.mugshotNote})` : ''}`);

  const pingCount = located ? pings(world, p.id, Math.max(first * MIN_PER_DAY, now - 7 * MIN_PER_DAY), now).length : 0;

  return {
    person: p,
    vehicle,
    home,
    work,
    sources: { plateReads, pings: pingCount, posts: myPosts.length, photos },
    visits: visitList,
    overnights,
    associates,
    routine,
    inferences,
    threat,
    threatReasons,
    posts: myPosts,
  };
}

function hhmm(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = Math.round(minute % 60);
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
}

function weekdayName(w: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][w] as string;
}
