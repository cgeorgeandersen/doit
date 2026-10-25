/**
 * A cell-site simulator ("Stingray", "IMSI catcher") pretends to be a cell
 * tower. Every phone in range connects to it and hands over its IMSI, the
 * number that identifies the SIM. It can't connect only to the phone police
 * want; it gets every phone nearby, and while connected those phones may not be
 * able to place calls.
 */
import { unit } from './rng';
import type { World } from './world';

export interface Capture {
  person: number;
  imsi: string;
  carrier: string;
  meters: number;
  /** dBm; closer is stronger. */
  signal: number;
  /** On a call when the device grabbed the phone; the call drops. */
  onCall: boolean;
}

export function capture(world: World, x: number, y: number, radius: number, t: number): Capture[] {
  const out: Capture[] = [];
  for (const p of world.people) {
    if (p.hidden || !p.phone.carried) continue;
    const pos = world.positionAt(p.id, t);
    const meters = Math.hypot(pos.x - x, pos.y - y);
    if (meters > radius) continue;
    out.push({
      person: p.id,
      imsi: p.phone.imsi,
      carrier: p.phone.carrier,
      meters,
      signal: Math.round(-48 - 38 * (meters / radius) - unit(world.seed, 'sig', p.id) * 8),
      onCall: unit(world.seed, 'call', p.id, Math.floor(t / 4)) < 0.035,
    });
  }
  return out.sort((a, b) => b.signal - a.signal);
}

/** Masks all but the last four digits, the way the device's display does before an analyst "resolves" it. */
export function maskImsi(imsi: string): string {
  return `${imsi.slice(0, 6)}•••••${imsi.slice(-4)}`;
}
