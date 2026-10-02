/**
 * Driving routes from OSRM on OpenStreetMap data: first the FOSSGIS server
 * that openstreetmap.org itself uses, then the OSRM project's demo server.
 * Both ask for at most one request a second, which a person clicking a button
 * never approaches; the guard below makes sure of it.
 */

import type { LngLat } from './geo';

export interface RouteOption {
  line: LngLat[];
  /** Meters. */
  distance: number;
  /** Seconds. */
  duration: number;
}

const SERVERS = [
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  'https://router.project-osrm.org/route/v1/driving',
];

export interface OsrmResponse {
  code: string;
  message?: string;
  routes?: Array<{ distance: number; duration: number; geometry: { coordinates: LngLat[] } }>;
}

export class NoRouteError extends Error {}

export function parseOsrm(json: OsrmResponse): RouteOption[] {
  if (json.code === 'NoRoute' || json.code === 'NoSegment') {
    throw new NoRouteError('No driving route connects these two places.');
  }
  if (json.code !== 'Ok' || !json.routes?.length) throw new Error(json.message ?? `Routing failed (${json.code})`);
  return json.routes.map((r) => ({ line: r.geometry.coordinates, distance: r.distance, duration: r.duration }));
}

let lastRequest = 0;

export async function findRoutes(from: LngLat, to: LngLat, signal?: AbortSignal): Promise<RouteOption[]> {
  const wait = lastRequest + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();

  const path = `${from[0].toFixed(6)},${from[1].toFixed(6)};${to[0].toFixed(6)},${to[1].toFixed(6)}`;
  const query = 'overview=full&geometries=geojson&alternatives=3&steps=false';
  let lastError: unknown = null;
  for (const server of SERVERS) {
    try {
      const res = await fetch(`${server}/${path}?${query}`, { signal });
      // A 400 means the request itself (e.g. no road near a point) is the problem; another server won't help.
      if (!res.ok && res.status !== 400) throw new Error(`Routing server answered ${res.status}`);
      return parseOsrm((await res.json()) as OsrmResponse);
    } catch (err) {
      if (err instanceof NoRouteError || signal?.aborted) throw err;
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Routing is unavailable right now.');
}
