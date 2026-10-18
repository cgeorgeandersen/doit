/**
 * Shareable links. A route or a town goes in the part of the URL after "#",
 * which browsers never send to a server. A route's ends are rounded to three
 * decimal places (about 100 m) so a shared commute doesn't reveal a front door.
 */

import type { LngLat } from './geo';

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (p: LngLat) => `${round3(p[1])},${round3(p[0])}`;

export function encodeRoute(from: LngLat, to: LngLat): string {
  return `#from=${fmt(from)}&to=${fmt(to)}`;
}

function parsePoint(value: string | null): LngLat | null {
  if (!value) return null;
  const [lat, lon] = value.split(',').map(Number);
  if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lon, lat];
}

export function decodeRoute(hash: string): { from: LngLat; to: LngLat } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const from = parsePoint(params.get('from'));
  const to = parsePoint(params.get('to'));
  return from && to ? { from, to } : null;
}

/** A town goes in by name, e.g. #town=Decatur,+GA. */
export function encodeTown(name: string, state: string): string {
  return `#town=${encodeURIComponent(`${name}, ${state}`).replace(/%2C/g, ',').replace(/%20/g, '+')}`;
}

export function decodeTown(hash: string): string | null {
  const town = new URLSearchParams(hash.replace(/^#/, '')).get('town')?.trim();
  return town ? town.slice(0, 100) : null;
}
