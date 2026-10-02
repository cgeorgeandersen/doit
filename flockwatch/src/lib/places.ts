/**
 * Instant suggestions for U.S. cities and towns, from the Census files that
 * scripts/build-data.ts publishes under /data/places/. The geocoder takes
 * seconds to answer; these take one small download per first letter, then
 * nothing.
 */

import type { Place } from './geocode';
import { STATE_ABBR } from './geocode';
import { haversine, type LngLat } from './geo';
import { foldText } from './normalize';

export interface IndexedPlace {
  name: string;
  state: string;
  lon: number;
  lat: number;
  /** Census population estimate; 0 for unincorporated communities, which it doesn't estimate. */
  pop: number;
  folded: string;
}

interface PlaceFile {
  v: 1;
  /** [name, state, lon, lat, population] */
  places: Array<[string, string, number, number, number]>;
}

const STATE_CODES = new Set(Object.values(STATE_ABBR));
const STATE_BY_NAME = new Map(Object.entries(STATE_ABBR).map(([name, abbr]) => [foldText(name), abbr]));

/** States whose code or name starts with `text` ("g" → GA, "new" → NH, NJ, NM, NY). */
function statesStartingWith(text: string): Set<string> {
  const out = new Set<string>();
  for (const abbr of STATE_CODES) if (abbr.toLowerCase().startsWith(text)) out.add(abbr);
  for (const [name, abbr] of STATE_BY_NAME) if (name.startsWith(text)) out.add(abbr);
  return out;
}

interface Parsed {
  base: string;
  states: Set<string> | null;
}

/**
 * Splits a trailing state off a query: "springfield il", "springfield,
 * illinois" and "atlanta, g" (still typing) all name a state; "new york" and
 * "fort m" don't.
 */
function parseQuery(query: string): Parsed[] {
  const comma = query.lastIndexOf(',');
  if (comma >= 0) {
    const base = foldText(query.slice(0, comma));
    const state = foldText(query.slice(comma + 1));
    const states = state ? statesStartingWith(state) : null;
    return [{ base, states: states?.size ? states : null }];
  }
  const words = foldText(query).split(' ').filter(Boolean);
  for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
    const tail = words.slice(-n).join(' ');
    const abbr = n === 1 && tail.length === 2 && STATE_CODES.has(tail.toUpperCase()) ? tail.toUpperCase() : STATE_BY_NAME.get(tail);
    if (abbr) return [{ base: words.slice(0, -n).join(' '), states: new Set([abbr]) }];
  }
  const all: Parsed[] = [{ base: words.join(' '), states: null }];
  // If the last word could be the start of a state ("atlanta g"), also try it as one; used only if the rest finds nothing.
  if (words.length > 1) {
    const states = statesStartingWith(words[words.length - 1]!);
    if (states.size) all.push({ base: words.slice(0, -1).join(' '), states });
  }
  return all;
}

/**
 * The best places for what someone has typed. A place scores for how well its
 * name matches (whole name, then start of name, then start of a later word,
 * as "ventura" matches "San Buenaventura (Ventura)"), plus the order of
 * magnitude of its population, plus up to 1.5 for being near `near` (the
 * other end of the route, or the map's view).
 */
export function matchPlaces(places: readonly IndexedPlace[], query: string, near?: LngLat, limit = 4): IndexedPlace[] {
  for (const { base, states } of parseQuery(query)) {
    if (base.length < 2) continue;
    const scored: Array<[number, IndexedPlace]> = [];
    for (const p of places) {
      if (states && !states.has(p.state)) continue;
      const match = p.folded === base ? 2 : p.folded.startsWith(base) ? 1 : ` ${p.folded}`.includes(` ${base}`) ? 0 : -1;
      if (match < 0) continue;
      const nearby = near ? 1.5 * Math.max(0, 1 - haversine(near, [p.lon, p.lat]) / 300_000) : 0;
      scored.push([match + Math.log10(p.pop + 10) + nearby, p]);
    }
    if (scored.length) {
      scored.sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length);
      return scored.slice(0, limit).map(([, p]) => p);
    }
  }
  return [];
}

export function decodePlaces(file: PlaceFile): IndexedPlace[] {
  return file.places.map(([name, state, lon, lat, pop]) => ({ name, state, lon, lat, pop, folded: foldText(name) }));
}

const files = new Map<string, Promise<IndexedPlace[]>>();

function loadFile(key: string): Promise<IndexedPlace[]> {
  let hit = files.get(key);
  if (!hit) {
    hit = fetch(`/data/places/${key}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<PlaceFile>).then(decodePlaces) : []))
      .catch(() => []);
    files.set(key, hit);
  }
  return hit;
}

/** Cities and towns matching `query`, as places ready to route to. Empty if the city files aren't available. */
export async function localPlaces(query: string, near?: LngLat, limit = 4): Promise<Place[]> {
  const key = foldText(query).charAt(0);
  if (!/[a-z]/.test(key)) return [];
  const index = await loadFile(key);
  return matchPlaces(index, query, near, limit).map((p) => ({ label: p.name, detail: p.state, lon: p.lon, lat: p.lat, kind: 'area' }));
}
