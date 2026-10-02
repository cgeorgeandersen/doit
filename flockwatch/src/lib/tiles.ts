/** Loads the camera data that scripts/build-data.ts publishes under /data/. */

import { decodeTile, type Camera, type CameraTile } from './camera';
import { densify, padBBox, type BBox, type LngLat } from './geo';
import { tileKey } from './normalize';

export interface Meta {
  generated: string;
  cameras: {
    source: string;
    sourceUrl: string;
    license: string;
    dataAsOf: string | null;
    total: number;
    flock: number;
    withDirection: number;
    withOperator: number;
    tiles: string[];
  };
}

/** [lon, lat, flockCount, otherCount] per 0.1° cell. */
export type OverviewCell = [number, number, number, number];

let metaPromise: Promise<Meta> | null = null;
export function loadMeta(): Promise<Meta> {
  metaPromise ??= fetch('/data/meta.json').then((r) => {
    if (!r.ok) throw new Error('Camera data is missing. Run `npm run data` to fetch it.');
    return r.json() as Promise<Meta>;
  });
  return metaPromise;
}

export function loadOverview(): Promise<OverviewCell[]> {
  return fetch('/data/overview.json').then((r) => (r.ok ? (r.json() as Promise<OverviewCell[]>) : []));
}

const tileCache = new Map<string, Promise<Camera[]>>();

function loadTile(key: string): Promise<Camera[]> {
  let hit = tileCache.get(key);
  if (!hit) {
    hit = fetch(`/data/cameras/${key}.json`).then((r) => {
      if (!r.ok) throw new Error(`Camera tile ${key}: ${r.status}`);
      return r.json().then((t) => decodeTile(t as CameraTile));
    });
    hit.catch(() => tileCache.delete(key));
    tileCache.set(key, hit);
  }
  return hit;
}

/** Keys of the 1° tiles a bounding box touches. */
export function tilesForBBox([w, s, e, n]: BBox): string[] {
  const keys: string[] = [];
  for (let lat = Math.floor(s); lat <= Math.floor(n); lat++) {
    for (let lon = Math.floor(w); lon <= Math.floor(e); lon++) keys.push(tileKey(lon, lat));
  }
  return keys;
}

/** Keys of the tiles within `padM` meters of a route: only those it passes through, not its whole bounding box. */
export function tilesForRoute(line: readonly LngLat[], padM: number): string[] {
  const keys = new Set<string>();
  const dense = densify(line, 1000);
  for (let i = 0; i < dense.length; i++) {
    const a = dense[i]!;
    const b = dense[Math.min(i + 1, dense.length - 1)]!;
    const box = padBBox([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])], padM);
    for (const key of tilesForBBox(box)) keys.add(key);
  }
  return [...keys];
}

async function loadTiles(keys: string[]): Promise<Camera[]> {
  const meta = await loadMeta();
  const available = new Set(meta.cameras.tiles);
  const tiles = await Promise.all(keys.filter((k) => available.has(k)).map(loadTile));
  return tiles.flat();
}

export const camerasInBBox = (box: BBox) => loadTiles(tilesForBBox(box));
export const camerasNearRoute = (line: readonly LngLat[], padM: number) => loadTiles(tilesForRoute(line, padM));
