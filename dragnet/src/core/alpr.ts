/**
 * Plate reader searches. Note what the system actually searches: the text its
 * OCR read off each photo, not the plate on the car. A search for one plate
 * can return another car whose plate was misread to match.
 */
import type { Camera } from './city';
import type { Vehicle } from './people';
import { dayOf, minuteOfDay } from './time';
import { type Read, readsFrom, type World } from './world';

export function normalizePlate(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9*?]/g, '');
}

/** "7K*392" or "7KDM39?" → a regular expression over normalized plates. */
export function platePattern(query: string): RegExp {
  const q = normalizePlate(query);
  const body = q.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${body}$`);
}

export interface Window {
  from: number;
  to: number;
}

function inWindow(world: World, w: Window): Read[] {
  const start = readsFrom(world, w.from);
  const end = readsFrom(world, w.to);
  return world.reads.slice(start, end);
}

export interface PlateHit {
  /** What the OCR read. */
  text: string;
  reads: Read[];
}

/** Reads whose OCR text matches the query, grouped by text, most reads first. */
export function searchPlate(world: World, query: string, w: Window): PlateHit[] {
  const re = platePattern(query);
  const byText = new Map<string, Read[]>();
  for (const r of inWindow(world, w)) {
    const text = normalizePlate(r.text);
    if (!re.test(text)) continue;
    const list = byText.get(r.text) ?? [];
    list.push(r);
    byText.set(r.text, list);
  }
  return [...byText.entries()].map(([text, reads]) => ({ text, reads })).sort((a, b) => b.reads.length - a.reads.length);
}

export interface Fingerprint {
  type?: string;
  color?: string;
  make?: string;
  /** A feature or sticker, matched as a substring. */
  feature?: string;
}

export function matchesFingerprint(v: Vehicle, f: Fingerprint): boolean {
  if (f.type && v.type !== f.type) return false;
  if (f.color && v.color !== f.color) return false;
  if (f.make && v.make !== f.make) return false;
  if (f.feature && !v.features.some((x) => x.toLowerCase().includes((f.feature as string).toLowerCase()))) return false;
  return true;
}

/** Search by what the car looks like: no plate needed. */
export function searchFingerprint(world: World, f: Fingerprint, w: Window): Map<number, Read[]> {
  const out = new Map<number, Read[]>();
  for (const r of inWindow(world, w)) {
    const v = world.vehicles[r.vehicle] as Vehicle;
    if (!matchesFingerprint(v, f)) continue;
    const list = out.get(v.id) ?? [];
    list.push(r);
    out.set(v.id, list);
  }
  return out;
}

export function readsAtCamera(world: World, camera: number, w: Window): Read[] {
  return inWindow(world, w).filter((r) => r.camera === camera);
}

export interface Frequent {
  camera: Camera;
  count: number;
  /** Typical hour of day, from the median read. */
  typicalMinute: number;
  /** Reads that were the car's last of the day: where it goes to sleep. */
  lastOfDay: number;
  firstOfDay: number;
}

/**
 * Where a car is usually seen. The camera that most often takes a car's last
 * read of the day is the one nearest to where it parks for the night.
 */
export function frequentLocations(world: World, reads: Read[]): Frequent[] {
  const byCam = new Map<number, Read[]>();
  for (const r of reads) byCam.set(r.camera, [...(byCam.get(r.camera) ?? []), r]);
  const byDay = new Map<number, Read[]>();
  for (const r of reads) byDay.set(dayOf(r.t), [...(byDay.get(dayOf(r.t)) ?? []), r]);
  const last = new Map<number, number>();
  const first = new Map<number, number>();
  for (const list of byDay.values()) {
    const sorted = [...list].sort((a, b) => a.t - b.t);
    const l = sorted[sorted.length - 1] as Read;
    const f = sorted[0] as Read;
    last.set(l.camera, (last.get(l.camera) ?? 0) + 1);
    first.set(f.camera, (first.get(f.camera) ?? 0) + 1);
  }
  return [...byCam.entries()]
    .map(([camera, list]) => {
      const minutes = list.map((r) => minuteOfDay(r.t)).sort((a, b) => a - b);
      return {
        camera: world.city.cameras[camera] as Camera,
        count: list.length,
        typicalMinute: minutes[Math.floor(minutes.length / 2)] as number,
        lastOfDay: last.get(camera) ?? 0,
        firstOfDay: first.get(camera) ?? 0,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export interface OvernightRun {
  camera: Camera;
  /** Consecutive most recent days whose last read was at this camera. */
  nights: number;
  since: number;
  before: Camera | null;
}

/**
 * Where the car has been ending its days lately. People move; a 30-day tally
 * can point at last month's address while the last week points at the new one.
 */
export function recentOvernight(world: World, reads: Read[]): OvernightRun | null {
  const lastByDay = new Map<number, Read>();
  for (const r of reads) {
    const d = dayOf(r.t);
    const prev = lastByDay.get(d);
    if (!prev || r.t > prev.t) lastByDay.set(d, r);
  }
  const days = [...lastByDay.keys()].sort((a, b) => b - a);
  const first = days[0];
  if (first === undefined) return null;
  const cam = (lastByDay.get(first) as Read).camera;
  let nights = 0;
  let since = first;
  let before: Camera | null = null;
  for (const d of days) {
    const c = (lastByDay.get(d) as Read).camera;
    if (c !== cam) {
      before = world.city.cameras[c] ?? null;
      break;
    }
    nights++;
    since = d;
  }
  return { camera: world.city.cameras[cam] as Camera, nights, since, before };
}

export interface Companion {
  vehicle: number;
  /** Times it passed the same camera within the window of the target. */
  together: number;
  days: number;
}

/**
 * "Convoy analysis": cars that keep passing the same cameras just before or
 * after the target. Vendors sell it for finding accomplices; it also finds
 * partners, carpools and friends.
 */
export function convoy(world: World, targetReads: Read[], target: number, seconds = 90): Companion[] {
  const window = seconds / 60;
  const tally = new Map<number, { together: number; days: Set<number> }>();
  for (const r of targetReads) {
    const start = readsFrom(world, r.t - window);
    for (let k = start; k < world.reads.length; k++) {
      const o = world.reads[k] as Read;
      if (o.t > r.t + window) break;
      if (o.camera !== r.camera || o.vehicle === target) continue;
      const entry = tally.get(o.vehicle) ?? { together: 0, days: new Set<number>() };
      entry.together++;
      entry.days.add(dayOf(o.t));
      tally.set(o.vehicle, entry);
    }
  }
  return [...tally.entries()]
    .map(([vehicle, e]) => ({ vehicle, together: e.together, days: e.days.size }))
    .filter((c) => c.together >= 3 && c.days >= 2)
    .sort((a, b) => b.together - a.together);
}

export interface HotlistEntry {
  plate: string;
  reason: string;
  /** What the listed vehicle is, according to the stolen-vehicle report. */
  description: string;
}

export function onHotlist(hotlist: HotlistEntry[], read: Read): HotlistEntry | undefined {
  const text = normalizePlate(read.text);
  return hotlist.find((h) => normalizePlate(h.plate) === text);
}
