/**
 * Builds the data FlockWatch serves from its own domain, into public/data/:
 *
 *   cameras/<lat>_<lon>.json   every mapped license plate reader, in 1° tiles
 *   overview.json              camera counts on a 0.1° grid, for the zoomed-out map
 *   officials/<st>.json        state legislators and members of Congress, per state
 *   places/<letter>.json       every U.S. city and town, for instant address suggestions
 *   meta.json                  totals, sources and dates
 *
 * Sources:
 *   - Cameras: DeFlock's nightly export of OpenStreetMap ALPR nodes
 *     (https://deflock.me; data © OpenStreetMap contributors, ODbL).
 *   - State legislators: Open States bulk data (https://open.pluralpolicy.com/data/).
 *   - Congress: unitedstates/congress-legislators (public domain).
 *   - Cities and towns: U.S. Census Bureau gazetteer and population
 *     estimates (public domain).
 *
 * Fetching once per deploy, instead of from every visitor's browser, keeps the
 * app fast, keeps visitors' routes away from third parties, and puts one small
 * load on these volunteer-run services instead of thousands.
 *
 * Run with: npm run data   (Node 22 runs this TypeScript file directly)
 * Options:  --only=cameras | --only=officials | --only=places
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { normalizeBrand, normalizeOperator, parseCsv, placeKey, placeName, tileKey } from '../src/lib/normalize.ts';
import { unzipSingle } from './unzip.ts';

const OUT = resolve(import.meta.dirname, '../public/data');
const USER_AGENT = 'FlockWatch/0.1 (+https://github.com/cgeorgeandersen/doit)';
const DEFLOCK_INDEX = 'https://cdn.deflock.me/regions/index.json';
const OPEN_STATES_CSV = (st: string) => `https://data.openstates.org/people/current/${st}.csv`;
const CONGRESS_JSON = 'https://unitedstates.github.io/congress-legislators/legislators-current.json';
const GAZETTEER_ZIP = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_place_national.zip';
const POPULATION_CSV = 'https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/cities/totals/sub-est2024.csv';

/** 50 states, DC and Puerto Rico: the places with both Census districts and Open States data. */
const STATES = [
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'dc', 'fl', 'ga', 'hi', 'id', 'il', 'in', 'ia', 'ks', 'ky',
  'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj', 'nm', 'ny', 'nc', 'nd', 'oh',
  'ok', 'or', 'pa', 'pr', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy',
];

const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);

async function fetchBytes(url: string, attempts = 3): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = err;
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw new Error(`Could not fetch ${url}: ${String(lastError)}`);
}

const fetchText = async (url: string) => (await fetchBytes(url)).toString('utf8');

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data));
}

/** Runs `fn` over `items`, `limit` at a time. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------- cameras --

interface DeflockNode {
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

interface DeflockIndex {
  regions: string[];
  tile_url: string;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

async function buildCameras(): Promise<Record<string, unknown>> {
  const index = JSON.parse(await fetchText(DEFLOCK_INDEX)) as DeflockIndex;
  const version = Number(new URL(index.tile_url).searchParams.get('v')) || null;
  console.log(`DeFlock: ${index.regions.length} regions, data version ${version ?? 'unknown'}`);

  const regions = await pool(index.regions, 4, async (region) => {
    const [lat, lon] = region.split('/');
    const url = index.tile_url.replace('{lat}', lat!).replace('{lon}', lon!);
    return JSON.parse(await fetchText(url)) as DeflockNode[];
  });

  interface Tile {
    brands: string[];
    ops: string[];
    brandIndex: Map<string, number>;
    opIndex: Map<string, number>;
    cams: Array<[number, number, number, number, number, string]>;
  }
  const tiles = new Map<string, Tile>();
  const overview = new Map<string, [number, number, number, number]>();
  const seen = new Set<number>();
  let total = 0;
  let flock = 0;
  let withDirection = 0;
  let withOperator = 0;

  for (const node of regions.flat()) {
    if (seen.has(node.id) || !Number.isFinite(node.lat) || !Number.isFinite(node.lon)) continue;
    seen.add(node.id);
    const t = node.tags ?? {};
    const brand = normalizeBrand(t.manufacturer ?? t.brand ?? t['surveillance:brand'] ?? t['surveillance:manufacturer']);
    const operator = normalizeOperator(t.operator ?? t['surveillance:operator']);
    const direction = (t.direction ?? t['camera:direction'] ?? '').trim();
    const isFlock = brand === 'Flock Safety';

    const key = tileKey(node.lon, node.lat);
    let tile = tiles.get(key);
    if (!tile) {
      tile = { brands: [''], ops: [''], brandIndex: new Map([['', 0]]), opIndex: new Map([['', 0]]), cams: [] };
      tiles.set(key, tile);
    }
    let b = tile.brandIndex.get(brand);
    if (b === undefined) tile.brandIndex.set(brand, (b = tile.brands.push(brand) - 1));
    let o = tile.opIndex.get(operator);
    if (o === undefined) tile.opIndex.set(operator, (o = tile.ops.push(operator) - 1));
    tile.cams.push([node.id, round6(node.lon), round6(node.lat), b, o, direction]);

    // Overview cells are 0.1°, keyed and placed at their centers.
    const cx = Math.round((Math.floor(node.lon * 10) / 10 + 0.05) * 100) / 100;
    const cy = Math.round((Math.floor(node.lat * 10) / 10 + 0.05) * 100) / 100;
    const cell = overview.get(`${cx},${cy}`) ?? [cx, cy, 0, 0];
    cell[isFlock ? 2 : 3]++;
    overview.set(`${cx},${cy}`, cell);

    total++;
    if (isFlock) flock++;
    if (direction) withDirection++;
    if (operator) withOperator++;
  }
  if (total < 1000) throw new Error(`Only ${total} cameras came back from DeFlock; refusing to publish a near-empty map.`);

  await rm(resolve(OUT, 'cameras'), { recursive: true, force: true });
  for (const [key, tile] of tiles) {
    tile.cams.sort((a, b) => a[0] - b[0]);
    await writeJson(resolve(OUT, `cameras/${key}.json`), { v: 1, brands: tile.brands, ops: tile.ops, cams: tile.cams });
  }
  await writeJson(resolve(OUT, 'overview.json'), [...overview.values()]);

  console.log(`Cameras: ${total.toLocaleString('en-US')} (${flock.toLocaleString('en-US')} Flock) in ${tiles.size} tiles`);
  return {
    cameras: {
      source: 'DeFlock (deflock.me), from OpenStreetMap',
      sourceUrl: 'https://deflock.me',
      license: 'Open Database License (ODbL), © OpenStreetMap contributors',
      dataVersion: version,
      dataAsOf: version ? new Date(version * 1000).toISOString() : null,
      total,
      flock,
      withDirection,
      withOperator,
      tiles: [...tiles.keys()].sort(),
    },
  };
}

// -------------------------------------------------------------- officials --

interface Legislator {
  name: string;
  party: string;
  chamber: string;
  district: string;
  email?: string;
  phone?: string;
  url?: string;
}

interface CongressMember {
  name: string;
  party: string;
  chamber: 'senate' | 'house';
  /** House district; 0 for at-large seats and delegates. */
  district?: number;
  phone?: string;
  url?: string;
  contact?: string;
}

/** The legislature's own page for a member if there is one, else the first link. */
function pickLink(links: string): string | undefined {
  const list = links.split(';').map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));
  return list.find((u) => /\.gov\b|\.us\b|legis|senate|house|assembly/i.test(new URL(u).hostname)) ?? list[0];
}

function toLegislator(row: Record<string, string>): Legislator | null {
  if (!row.name || !row.current_chamber || !row.current_district) return null;
  const leg: Legislator = {
    name: row.name.trim(),
    party: (row.current_party ?? '').trim(),
    chamber: row.current_chamber.trim(),
    district: row.current_district.trim(),
  };
  const email = (row.email ?? '').split(';')[0]?.trim();
  const phone = (row.capitol_voice || row.district_voice || '').split(';')[0]?.trim();
  const url = pickLink(row.links ?? '');
  if (email) leg.email = email;
  if (phone) leg.phone = phone;
  if (url) leg.url = url;
  return leg;
}

interface CongressRecord {
  name: { official_full?: string; first: string; last: string };
  terms: Array<{ type: 'sen' | 'rep'; state: string; district?: number; party?: string; phone?: string; url?: string; contact_form?: string }>;
}

async function buildOfficials(): Promise<Record<string, unknown>> {
  const congress = JSON.parse(await fetchText(CONGRESS_JSON)) as CongressRecord[];
  const byState = new Map<string, CongressMember[]>();
  for (const person of congress) {
    const term = person.terms.at(-1);
    if (!term) continue;
    const member: CongressMember = {
      name: person.name.official_full ?? `${person.name.first} ${person.name.last}`,
      party: term.party ?? '',
      chamber: term.type === 'sen' ? 'senate' : 'house',
    };
    if (term.type === 'rep') member.district = term.district ?? 0;
    if (term.phone) member.phone = term.phone;
    if (term.url) member.url = term.url;
    if (term.contact_form) member.contact = term.contact_form;
    const st = term.state.toLowerCase();
    byState.set(st, [...(byState.get(st) ?? []), member]);
  }
  console.log(`Congress: ${congress.length} members`);

  await rm(resolve(OUT, 'officials'), { recursive: true, force: true });
  const missing: string[] = [];
  await pool(STATES, 4, async (st) => {
    let legislators: Legislator[] = [];
    try {
      legislators = parseCsv(await fetchText(OPEN_STATES_CSV(st)))
        .map(toLegislator)
        .filter((l): l is Legislator => l !== null);
    } catch (err) {
      // The page falls back to a link for finding legislators; don't fail the deploy over one state.
      console.warn(`Open States: no data for ${st.toUpperCase()} (${String(err)})`);
      missing.push(st);
    }
    await writeJson(resolve(OUT, `officials/${st}.json`), { state: st, legislators, congress: byState.get(st) ?? [] });
  });
  console.log(`State legislators: ${STATES.length - missing.length} of ${STATES.length} states`);
  return {
    officials: {
      stateLegislators: 'Open States (open.pluralpolicy.com)',
      congress: 'unitedstates/congress-legislators',
      statesMissing: missing.sort(),
    },
  };
}

// ----------------------------------------------------------------- places --

/**
 * Every U.S. city, town, village and unincorporated community (Census
 * "places"), so the address boxes can suggest them instantly instead of
 * waiting on the geocoder. Split by first letter, so typing "a" loads only
 * the A file. Ranked by population where the Census estimates it (cities and
 * towns; unincorporated communities count as 0).
 */
async function buildPlaces(): Promise<Record<string, unknown>> {
  const [zip, populationCsv] = await Promise.all([fetchBytes(GAZETTEER_ZIP), fetchText(POPULATION_CSV)]);

  const population = new Map<string, number>();
  const popRows = parseCsv(populationCsv);
  // Use the newest year in the file, so a later vintage of the same file still works.
  const latest = Object.keys(popRows[0] ?? {})
    .filter((k) => /^POPESTIMATE\d{4}$/.test(k))
    .sort()
    .at(-1);
  for (const row of popRows) {
    if (row.SUMLEV === '162' && latest) population.set(`${row.STATE}${row.PLACE}`, Number(row[latest]) || 0);
  }

  const lines = unzipSingle(zip).toString('utf8').split(/\r?\n/);
  const header = (lines[0] ?? '').split('\t').map((h) => h.trim());
  const at = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Gazetteer is missing the ${name} column`);
    return i;
  };
  const [iState, iGeoid, iName, iLat, iLon] = [at('USPS'), at('GEOID'), at('NAME'), at('INTPTLAT'), at('INTPTLONG')];

  const byKey = new Map<string, Array<[string, string, number, number, number]>>();
  let count = 0;
  for (const line of lines.slice(1)) {
    const cells = line.split('\t').map((c) => c.trim());
    const name = placeName(cells[iName] ?? '');
    const lat = Number(cells[iLat]);
    const lon = Number(cells[iLon]);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
    const key = placeKey(name);
    const list = byKey.get(key) ?? [];
    list.push([name, cells[iState] ?? '', round4(lon), round4(lat), population.get(cells[iGeoid] ?? '') ?? 0]);
    byKey.set(key, list);
    count++;
  }
  if (count < 10_000) throw new Error(`Only ${count} places in the gazetteer; refusing to publish.`);

  await rm(resolve(OUT, 'places'), { recursive: true, force: true });
  for (const [key, list] of byKey) {
    list.sort((a, b) => b[4] - a[4] || a[0].localeCompare(b[0]));
    await writeJson(resolve(OUT, `places/${key}.json`), { v: 1, places: list });
  }
  console.log(`Places: ${count.toLocaleString('en-US')} cities and towns (${population.size.toLocaleString('en-US')} with population)`);
  return {
    places: {
      source: 'U.S. Census Bureau: 2024 gazetteer of places and population estimates',
      count,
      withPopulation: population.size,
      populationYear: latest?.slice(-4) ?? null,
    },
  };
}

// ------------------------------------------------------------------- main --

const meta: Record<string, unknown> = { generated: new Date().toISOString() };
if (!only || only === 'cameras') Object.assign(meta, await buildCameras());
if (!only || only === 'officials') Object.assign(meta, await buildOfficials());
if (!only || only === 'places') {
  try {
    Object.assign(meta, await buildPlaces());
  } catch (err) {
    // City suggestions are a convenience; the address boxes still work through the geocoder without them.
    console.warn(`Places: skipped (${String(err)})`);
  }
}
if (!only) await writeJson(resolve(OUT, 'meta.json'), meta);
console.log(only ? `Done (${only} only; meta.json left as it was).` : `Done: ${OUT}`);
