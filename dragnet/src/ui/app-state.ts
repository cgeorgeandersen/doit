/**
 * The running console: the world, the clock, the audit log, the hotlist and a
 * typed event bus that tools publish to and cases listen on.
 */
import type { SoundEvent } from '../core/acoustic';
import type { HotlistEntry } from '../core/alpr';
import { AuditLog, type ToolId } from '../core/audit';
import type { Candidate } from '../core/face';
import type { Device } from '../core/location';
import { buildPosts, DEFAULT_KEYWORDS, type Post } from '../core/social';
import type { Capture } from '../core/stingray';
import { at, TODAY } from '../core/time';
import type { Read, World } from '../core/world';

export interface Events {
  tick: { now: number; prev: number };
  read: { read: Read };
  'hotlist-hit': { read: Read; entry: HotlistEntry };
  'plate-search': { query: string; vehicles: number[]; reads: number };
  'fingerprint-search': { query: string; vehicles: number[] };
  'capture-viewed': { read: Read };
  'owner-lookup': { vehicle: number };
  'frequent-locations': { vehicle: number };
  'geofence': { devices: Device[]; source: 'broker' | 'warrant' };
  'device-context': { person: number };
  'unmask': { person: number };
  'stingray-start': { x: number; y: number; radius: number };
  'stingray-capture': { captures: Capture[] };
  'stingray-target': { person: number };
  'face-search': { candidates: Candidate[]; edited: string | null; probe: string };
  'alibi-check': { person: number };
  'sound-alert': { event: SoundEvent };
  'sound-triage': { event: SoundEvent; action: 'dispatch' | 'dismiss' | 'reclassify' };
  'social-scan': { flagged: number };
  'watchlist': { people: number[] };
  'account-resolved': { person: number };
  'forecast-run': { days: number; reportedOnly: boolean; revealed: boolean };
  'dossier-open': { person: number };
  'dispatch': { what: string; detail: string };
  'tool': { tool: ToolId };
  'audit-open': Record<string, never>;
}

type Listener<K extends keyof Events> = (e: Events[K]) => void;

export type Mode = 'story' | 'free';

export const ANALYST = 'Analyst #4471 (you)';

export class App {
  world: World;
  mode: Mode;
  now: number;
  /** Simulated seconds per real second. */
  speed: number;
  paused = false;
  audit = new AuditLog();
  hotlist: HotlistEntry[];
  posts: Post[];
  keywords: Record<string, number> = { ...DEFAULT_KEYWORDS };
  watchlist = new Set<number>();
  soundOn = true;
  /** Last reason typed; offered as a default next time, the way people reuse them. */
  lastReason = '';
  private listeners = new Map<keyof Events, Listener<keyof Events>[]>();

  constructor(world: World, mode: Mode) {
    this.world = world;
    this.mode = mode;
    this.now = at(TODAY, 14, 0);
    this.speed = mode === 'story' ? 6 : 10;
    this.posts = buildPosts(world);
    this.hotlist = [
      { plate: '7KDM392', reason: 'Stolen vehicle (report 26-11873, filed 07:12 today)', description: 'silver 2019 Toyota Corolla' },
      { plate: '5WGX218', reason: 'Wanted: felony warrant (registered owner)', description: 'black 2015 Dodge Charger' },
      { plate: '9PLT447', reason: 'Stolen plates', description: 'unknown vehicle' },
    ];
  }

  on<K extends keyof Events>(type: K, fn: Listener<K>): () => void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn as Listener<keyof Events>);
    this.listeners.set(type, list);
    return () => {
      const l = this.listeners.get(type) ?? [];
      const i = l.indexOf(fn as Listener<keyof Events>);
      if (i >= 0) l.splice(i, 1);
    };
  }

  emit<K extends keyof Events>(type: K, e: Events[K]): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) (fn as Listener<K>)(e);
  }

  /** Records a search in the audit log and says so to anyone listening. */
  log(tool: ToolId, query: string, reason: string, people: Iterable<number>, user = ANALYST, t = this.now): void {
    const list = [...new Set(people)].filter((id) => !this.world.people[id]?.hidden);
    this.audit.add({ t, tool, user, query, reason, people: list });
    if (user === ANALYST) this.lastReason = reason;
  }
}
