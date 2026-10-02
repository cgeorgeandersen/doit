/**
 * Who answers for a camera at a given spot.
 *
 * A city or county council approves (and can cancel) the contract for police
 * cameras, the mayor or county leaders sign it, and state legislators write the
 * rules every camera in the state has to follow: how long data is kept, who can
 * search it, and whether it can be shared with federal agencies. So for a point
 * on the map we look up:
 *
 *   1. Which governments cover it: the U.S. Census Geocoder returns the city or
 *      township, county, state, and legislative and congressional districts.
 *   2. The state legislators for those districts (Open States) and the members
 *      of Congress (unitedstates/congress-legislators), both prepared at build
 *      time and served from this site.
 *   3. The mayor or county leader, from Wikidata, matched by the Census's
 *      GNIS code for the place.
 */

export interface Area {
  name: string;
  /** U.S. Geological Survey GNIS code, as the Census writes it (zero-padded). */
  gnis: string;
}

export interface Jurisdiction {
  state: { name: string; abbr: string };
  /** City, town, village, borough or township government, if the spot is inside one. */
  local: (Area & { label: string; kind: string }) | null;
  /** The county, and whether it has a government of its own (some, as in Connecticut, don't). */
  county: (Area & { governs: boolean }) | null;
  upper: { name: string; basename: string } | null;
  lower: { name: string; basename: string } | null;
  /** House district number; 0 for at-large seats and delegates. */
  congressional: number | null;
}

export interface Official {
  role: string;
  name: string;
  party?: string;
  district?: string;
  email?: string;
  phone?: string;
  url?: string;
  /** For the small print: where the name came from. */
  source: 'Wikidata' | 'Open States' | 'congress-legislators';
}

export interface Responsible {
  jurisdiction: Jurisdiction;
  local: { label: string; body: string; official?: Official; website?: string } | null;
  county: { label: string; body: string; official?: Official; website?: string } | null;
  state: Official[];
  federal: Official[];
}

// ------------------------------------------------------------- jurisdiction --

interface CensusGeography {
  NAME?: string;
  BASENAME?: string;
  STUSAB?: string;
  GEOID?: string;
  FUNCSTAT?: string;
  PLACENS?: string;
  COUSUBNS?: string;
  COUNTYNS?: string;
}

export interface CensusResponse {
  result?: { geographies?: Record<string, CensusGeography[]> };
}

/** Census functional status codes for units with a working government of their own. */
const GOVERNS = new Set(['A', 'B', 'C', 'G']);

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** "Atlanta city" → "City of Atlanta"; "Cranberry township" → "Cranberry Township". */
export function localLabel(name: string, basename: string): { label: string; kind: string } {
  const kind = name.startsWith(basename) ? name.slice(basename.length).trim().toLowerCase() : '';
  if (['city', 'town', 'village', 'borough'].includes(kind)) return { label: `${titleCase(kind)} of ${basename}`, kind };
  if (kind === 'township' || kind === 'charter township') return { label: `${basename} ${titleCase(kind)}`, kind: 'township' };
  return { label: name, kind: kind || 'local government' };
}

/** Reads the Census Geocoder's answer for one point. Layer names carry years, so they are matched loosely. */
export function parseCensus(json: CensusResponse): Jurisdiction | null {
  const geos = json.result?.geographies;
  if (!geos) return null;
  const layer = (pattern: RegExp): CensusGeography | undefined => {
    for (const [name, list] of Object.entries(geos)) if (pattern.test(name) && list[0]) return list[0];
    return undefined;
  };

  const state = layer(/^States$/);
  if (!state?.STUSAB || !state.NAME) return null;
  const place = layer(/^Incorporated Places$/);
  const cousub = layer(/^County Subdivisions$/);
  const county = layer(/^Counties$/);
  const upper = layer(/State Legislative Districts - Upper$/);
  const lower = layer(/State Legislative Districts - Lower$/);
  const cd = layer(/Congressional Districts$/);

  let local: Jurisdiction['local'] = null;
  if (state.STUSAB === 'DC') {
    local = { name: 'District of Columbia', label: 'District of Columbia', kind: 'district', gnis: place?.PLACENS ?? '' };
  } else if (place?.NAME && place.BASENAME && GOVERNS.has(place.FUNCSTAT ?? '')) {
    local = { name: place.NAME, gnis: place.PLACENS ?? '', ...localLabel(place.NAME, place.BASENAME) };
  } else if (cousub?.NAME && cousub.BASENAME && GOVERNS.has(cousub.FUNCSTAT ?? '')) {
    local = { name: cousub.NAME, gnis: cousub.COUSUBNS ?? '', ...localLabel(cousub.NAME, cousub.BASENAME) };
  }

  const cdNumber = cd?.GEOID ? Number(cd.GEOID.slice(-2)) : NaN;
  return {
    state: { name: state.NAME, abbr: state.STUSAB },
    local,
    county:
      county?.NAME && state.STUSAB !== 'DC'
        ? { name: county.NAME, gnis: county.COUNTYNS ?? '', governs: GOVERNS.has(county.FUNCSTAT ?? '') }
        : null,
    upper: upper?.NAME ? { name: upper.NAME, basename: upper.BASENAME ?? upper.NAME } : null,
    lower: lower?.NAME ? { name: lower.NAME, basename: lower.BASENAME ?? lower.NAME } : null,
    // 98 is the Census code for a delegate seat; the member data calls it district 0, like at-large seats.
    congressional: Number.isFinite(cdNumber) ? (cdNumber === 98 ? 0 : cdNumber) : null,
  };
}

// ------------------------------------------------------------- legislators --

export interface Legislator {
  name: string;
  party: string;
  chamber: string;
  district: string;
  email?: string;
  phone?: string;
  url?: string;
}

export interface CongressMember {
  name: string;
  party: string;
  chamber: 'senate' | 'house';
  district?: number;
  phone?: string;
  url?: string;
  contact?: string;
}

export interface StateFile {
  state: string;
  legislators: Legislator[];
  congress: CongressMember[];
}

const ORDINALS = [
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh',
  'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth',
];
const ordinalSuffix = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'));

/**
 * Reduces a district name to a comparable key, so the Census's "Third Suffolk
 * District" matches Open States' "3rd Suffolk", and "State House District 058"
 * matches "58".
 */
export function districtKey(raw: string): string {
  let s = ` ${raw.toLowerCase()} `.replace(/&/g, ' and ');
  s = s.replace(/\b(state\s+)?(senate|house|assembly|legislative|representative|delegate)?\s*district\b/g, ' ');
  ORDINALS.forEach((word, i) => {
    s = s.replace(new RegExp(`\\b${word}\\b`, 'g'), `${i + 1}${ordinalSuffix(i + 1)}`);
  });
  s = s.replace(/\b0+(\d)/g, '$1');
  return s.replace(/[^a-z0-9]/g, '');
}

const PARTIES: Array<[RegExp, string]> = [
  [/farmer/i, 'DFL'],
  [/^democrat/i, 'D'],
  [/^republican/i, 'R'],
  [/independent/i, 'I'],
  [/libertarian/i, 'L'],
  [/green/i, 'G'],
  [/progressive/i, 'P'],
  [/nonpartisan/i, ''],
];

export function partyAbbr(party: string): string {
  for (const [pattern, abbr] of PARTIES) if (pattern.test(party)) return abbr;
  return party.slice(0, 1).toUpperCase();
}

const LOWER_TITLES: Record<string, string> = {
  CA: 'Assembly member', NV: 'Assembly member', NY: 'Assembly member', WI: 'Assembly member', NJ: 'Assembly member',
  MD: 'Delegate', VA: 'Delegate', WV: 'Delegate',
};

function legislatorOfficial(l: Legislator, role: string): Official {
  const o: Official = { role, name: l.name, district: l.district, source: 'Open States' };
  const party = partyAbbr(l.party);
  if (party) o.party = party;
  if (l.email) o.email = l.email;
  if (l.phone) o.phone = l.phone;
  if (l.url) o.url = l.url;
  return o;
}

/** The state legislators (or, in DC, council members) who represent the spot. */
export function matchLegislators(j: Jurisdiction, file: StateFile): Official[] {
  const abbr = j.state.abbr;
  if (abbr === 'DC') {
    const ward = j.upper ? districtKey(j.upper.name) : '';
    return file.legislators
      .filter((l) => (ward && districtKey(l.district) === ward) || /at-?large|chair/i.test(l.district))
      .sort((a, b) => Number(/at-?large|chair/i.test(a.district)) - Number(/at-?large|chair/i.test(b.district)))
      .map((l) =>
        legislatorOfficial(
          l,
          /chair/i.test(l.district) ? 'Council chair' : /at-?large/i.test(l.district) ? 'At-large councilmember' : 'Ward councilmember',
        ),
      );
  }

  const out: Official[] = [];
  const pick = (district: Jurisdiction['upper'], chambers: string[], role: string) => {
    if (!district) return;
    const keys = new Set([districtKey(district.basename), districtKey(district.name)]);
    for (const l of file.legislators) {
      if (chambers.includes(l.chamber) && keys.has(districtKey(l.district))) out.push(legislatorOfficial(l, role));
    }
  };
  pick(j.upper, ['upper', 'legislature'], 'State senator');
  pick(j.lower, ['lower'], LOWER_TITLES[abbr] ?? 'State representative');
  return out;
}

/** The U.S. House member for the district, then the state's two senators. */
export function matchCongress(j: Jurisdiction, file: StateFile): Official[] {
  const toOfficial = (m: CongressMember, role: string): Official => {
    const o: Official = { role, name: m.name, source: 'congress-legislators' };
    const party = partyAbbr(m.party);
    if (party) o.party = party;
    if (m.chamber === 'house') o.district = m.district ? `${j.state.abbr}-${m.district}` : `${j.state.abbr} at large`;
    if (m.phone) o.phone = m.phone;
    if (m.contact ?? m.url) o.url = m.contact ?? m.url;
    return o;
  };
  const house = file.congress.filter((m) => m.chamber === 'house' && j.congressional !== null && (m.district ?? 0) === j.congressional);
  const senate = file.congress.filter((m) => m.chamber === 'senate');
  const houseRole = ['DC', 'PR'].includes(j.state.abbr) ? (j.state.abbr === 'PR' ? 'Resident commissioner' : 'Delegate to Congress') : 'U.S. representative';
  return [...house.map((m) => toOfficial(m, houseRole)), ...senate.map((m) => toOfficial(m, 'U.S. senator'))];
}

// ----------------------------------------------------------------- Wikidata --

export interface HeadOfGovernment {
  gnis: string;
  head?: string;
  /** The person's Wikidata page, so anyone can check or correct the name. */
  headUrl?: string;
  office?: string;
  website?: string;
}

export interface SparqlResponse {
  results: { bindings: Array<Record<string, { value: string } | undefined>> };
}

const stripZeros = (gnis: string) => gnis.replace(/^0+/, '');

/**
 * The Wikidata query for the current heads of government of places, by GNIS
 * code. A city's own "head of government" field is often left stale after an
 * election (Oakland's still named a mayor recalled in 2024), while people's
 * "position held" records usually get updated. So it asks for both: who holds
 * the city's head-of-government office, with a start date and no end date
 * (undated records are often decades old), and the city's own field, skipping
 * anyone recorded as having left the office or as having died. Only people
 * count: Wikidata once listed a video game character as mayor of New York.
 */
export function headsQuery(gnisCodes: string[]): string {
  const values = gnisCodes.map((g) => `"${stripZeros(g).replace(/\D/g, '')}"`).join(' ');
  return `SELECT ?gnis ?source ?head ?headLabel ?rank ?start ?officeLabel ?site WHERE {
  VALUES ?gnis { ${values} }
  ?item wdt:P590 ?gnis .
  OPTIONAL { ?item wdt:P856 ?site }
  OPTIONAL { ?item wdt:P1313 ?office }
  OPTIONAL {
    {
      ?item wdt:P1313 ?held .
      ?head p:P39 ?pos . ?pos ps:P39 ?held ; pq:P580 ?start .
      FILTER NOT EXISTS { ?pos pq:P582 ?posEnd }
      BIND("office" AS ?source)
    } UNION {
      ?item p:P6 ?st . ?st ps:P6 ?head ; wikibase:rank ?rank .
      FILTER NOT EXISTS { ?st pq:P582 ?stEnd }
      FILTER(?rank != wikibase:DeprecatedRank)
      FILTER NOT EXISTS { ?item wdt:P1313 ?o . ?head p:P39 ?left . ?left ps:P39 ?o ; pq:P582 ?leftEnd }
      OPTIONAL { ?st pq:P580 ?start }
      BIND("p6" AS ?source)
    }
    FILTER EXISTS { ?head wdt:P31 wd:Q5 }
    FILTER NOT EXISTS { ?head wdt:P570 ?died }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

/**
 * Only links that look like a government's own site: Wikidata sometimes lists a
 * tourism site instead ("discoveratlanta.com"). Deliberately strict, since
 * words like "city" and "town" also appear in "visitkansascity" and "downtown".
 */
export function looksGovernmental(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (/\.(gov|us|mil)$/.test(host)) return true;
    return host.split('.').some((label) => /^(cityof|townof|villageof|boroughof|countyof)/.test(label) || /(township|twp)$/.test(label));
  } catch {
    return false;
  }
}

interface HeadCandidate {
  head: string;
  url: string;
  start: string;
  preferred: boolean;
}

/**
 * Picks, per GNIS code, the current head of government and an official
 * website. The most recent dated office-holder wins; the city's own field is
 * used when there is none, or when it names someone who started later.
 */
export function parseHeads(json: SparqlResponse): Map<string, HeadOfGovernment> {
  const rows = new Map<string, { office?: string; website?: string; holders: HeadCandidate[]; field: HeadCandidate[] }>();
  for (const b of json.results.bindings) {
    const gnis = b.gnis?.value;
    if (!gnis) continue;
    const entry = rows.get(gnis) ?? { holders: [], field: [] };
    rows.set(gnis, entry);
    const office = b.officeLabel?.value;
    if (office && !/^Q\d+$/.test(office)) entry.office = office;
    const site = b.site?.value;
    if (site && looksGovernmental(site) && (!entry.website || site.length < entry.website.length)) entry.website = site;
    const head = b.headLabel?.value;
    // Labels that are bare Q-ids mean Wikidata has no English name; skip them.
    if (!head || /^Q\d+$/.test(head)) continue;
    // "Unknown value" dates arrive as opaque identifiers, not dates; treat them as missing.
    const start = /^\d{4}-\d\d-\d\dT/.test(b.start?.value ?? '') ? b.start!.value : '';
    const url = (b.head?.value ?? '').replace('http://www.wikidata.org/entity/', 'https://www.wikidata.org/wiki/');
    const candidate = { head, url, start, preferred: Boolean(b.rank?.value.endsWith('PreferredRank')) };
    if (b.source?.value === 'office') {
      if (start) entry.holders.push(candidate);
    } else entry.field.push(candidate);
  }

  const latest = (list: HeadCandidate[]) =>
    [...list].sort((a, b) => Number(b.preferred) - Number(a.preferred) || b.start.localeCompare(a.start))[0];
  const out = new Map<string, HeadOfGovernment>();
  for (const [gnis, entry] of rows) {
    const holder = [...entry.holders].sort((a, b) => b.start.localeCompare(a.start))[0];
    const field = latest(entry.field);
    const pick = holder && field && field.head !== holder.head && field.start > holder.start ? field : (holder ?? field);
    const result: HeadOfGovernment = { gnis };
    if (pick) {
      result.head = pick.head;
      if (pick.url.startsWith('https://www.wikidata.org/wiki/Q')) result.headUrl = pick.url;
    }
    if (entry.office) result.office = entry.office;
    if (entry.website) result.website = entry.website;
    out.set(gnis, result);
  }
  return out;
}

/** "mayor of Atlanta" → "Mayor"; "chair of the Cobb County Board of Commissioners" → kept, capitalized. */
export function officeTitle(office: string | undefined, kind: string): string {
  if (office) {
    if (/^mayor\b/i.test(office)) return 'Mayor';
    return office.charAt(0).toUpperCase() + office.slice(1);
  }
  return ['city', 'town', 'village', 'borough', 'district'].includes(kind) ? 'Mayor' : 'Leader';
}

// ------------------------------------------------------------------ network --

const CENSUS_URL = '/api/census/coordinates';
const WIKIDATA_URL = 'https://query.wikidata.org/sparql';

const jurisdictionCache = new Map<string, Promise<Jurisdiction | null>>();
const stateCache = new Map<string, Promise<StateFile | null>>();
const headCache = new Map<string, Promise<HeadOfGovernment | undefined>>();

/** At most a few Census requests at once, so hovering across a dense area stays polite. */
let active = 0;
const waiting: Array<() => void> = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export function lookupJurisdiction(lon: number, lat: number): Promise<Jurisdiction | null> {
  const key = `${lon.toFixed(5)},${lat.toFixed(5)}`;
  let hit = jurisdictionCache.get(key);
  if (!hit) {
    const params = new URLSearchParams({
      x: lon.toFixed(6),
      y: lat.toFixed(6),
      benchmark: 'Public_AR_Current',
      vintage: 'Current_Current',
      layers: 'all',
      format: 'json',
    });
    hit = limited(async () => {
      const res = await fetch(`${CENSUS_URL}?${params}`);
      if (!res.ok) throw new Error(`Census Geocoder: ${res.status}`);
      return parseCensus((await res.json()) as CensusResponse);
    });
    hit.catch(() => jurisdictionCache.delete(key));
    jurisdictionCache.set(key, hit);
  }
  return hit;
}

function loadStateFile(abbr: string): Promise<StateFile | null> {
  const st = abbr.toLowerCase();
  let hit = stateCache.get(st);
  if (!hit) {
    hit = fetch(`/data/officials/${st}.json`).then((r) => (r.ok ? (r.json() as Promise<StateFile>) : null));
    hit.catch(() => stateCache.delete(st));
    stateCache.set(st, hit);
  }
  return hit;
}

function loadHeads(codes: string[]): Promise<Map<string, HeadOfGovernment | undefined>> {
  const wanted = codes.filter(Boolean);
  const missing = wanted.filter((g) => !headCache.has(g));
  if (missing.length) {
    const query = fetch(`${WIKIDATA_URL}?${new URLSearchParams({ query: headsQuery(missing), format: 'json' })}`, {
      headers: { Accept: 'application/sparql-results+json' },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Wikidata: ${r.status}`);
        return r.json() as Promise<SparqlResponse>;
      })
      .then(parseHeads);
    for (const g of missing) {
      const one = query.then((m) => m.get(stripZeros(g)));
      one.catch(() => headCache.delete(g));
      headCache.set(g, one);
    }
  }
  return Promise.all(wanted.map(async (g) => [g, await headCache.get(g)!.catch(() => undefined)] as const)).then(
    (pairs) => new Map(pairs),
  );
}

export interface PlaceSummary {
  label: string;
  /** The elected body that approves camera contracts there, e.g. "City council". */
  body: string;
  cameras: number;
  official?: Official;
  website?: string;
}

/** The elected body that usually approves police camera contracts for a kind of government. */
export function governingBody(kind: string): string {
  switch (kind) {
    case 'city':
      return 'City council';
    case 'town':
      return 'Town council';
    case 'village':
      return 'Village board';
    case 'borough':
      return 'Borough council';
    case 'township':
      return 'Township board';
    case 'county':
      return 'County board';
    case 'district':
      return 'D.C. Council';
    default:
      return 'Local council';
  }
}

export interface ResponsibleSummary {
  /** Local governments (or counties, for unincorporated land), most cameras first. */
  places: PlaceSummary[];
  /** State legislators whose districts hold the cameras, most cameras first. */
  legislators: Array<Official & { cameras: number }>;
  /** Members of Congress, most cameras first. */
  congress: Array<Official & { cameras: number }>;
  /** Cameras whose location couldn't be looked up (outside the U.S., or a failed request). */
  unresolved: number;
}

/** Who answers for a whole set of cameras, grouped by government and legislator. */
export async function summarizeResponsible(
  points: ReadonlyArray<{ lon: number; lat: number }>,
  onProgress?: (done: number, total: number) => void,
): Promise<ResponsibleSummary> {
  let done = 0;
  const jurisdictions = await Promise.all(
    points.map((p) =>
      lookupJurisdiction(p.lon, p.lat)
        .catch(() => null)
        .finally(() => onProgress?.(++done, points.length)),
    ),
  );

  const places = new Map<string, Omit<PlaceSummary, 'body'> & { area: Area | null; kind: string }>();
  const people = new Map<string, Official & { cameras: number }>();
  const congress = new Map<string, Official & { cameras: number }>();
  const tally = (map: Map<string, Official & { cameras: number }>, o: Official) => {
    const key = `${o.role}|${o.name}|${o.district ?? ''}`;
    const hit = map.get(key);
    if (hit) hit.cameras++;
    else map.set(key, { ...o, cameras: 1 });
  };

  let unresolved = 0;
  for (const j of jurisdictions) {
    if (!j) {
      unresolved++;
      continue;
    }
    const county = j.county;
    const label = j.local
      ? j.local.label
      : county
        ? county.governs
          ? `Unincorporated ${county.name}`
          : county.name
        : j.state.name;
    const area: Area | null = j.local ?? (county?.governs ? county : null);
    const place = places.get(label) ?? { label, cameras: 0, area, kind: j.local?.kind ?? 'county' };
    place.cameras++;
    places.set(label, place);

    const file = await loadStateFile(j.state.abbr).catch(() => null);
    if (!file) continue;
    for (const o of matchLegislators(j, file)) tally(people, o);
    for (const o of matchCongress(j, file)) tally(congress, o);
  }

  const heads = await loadHeads([...places.values()].map((p) => p.area?.gnis ?? '')).catch(
    () => new Map<string, HeadOfGovernment | undefined>(),
  );
  const byCount = <T extends { cameras: number }>(a: T, b: T) => b.cameras - a.cameras;
  return {
    places: [...places.values()]
      .map(({ area, kind, ...p }) => {
        const head = area ? heads.get(area.gnis) : undefined;
        const out: PlaceSummary = { ...p, body: governingBody(kind) };
        if (head?.head) {
          out.official = { role: officeTitle(head.office, kind), name: head.head, source: 'Wikidata' };
          if (head.headUrl) out.official.url = head.headUrl;
        }
        if (head?.website) out.website = head.website;
        return out;
      })
      .sort(byCount),
    legislators: [...people.values()].sort(byCount),
    congress: [...congress.values()].sort(byCount),
    unresolved,
  };
}

/**
 * Everything the camera card shows under "Who to contact". `onPartial` is
 * called first with the legislators (fast: static files) and again once the
 * slower Wikidata lookup for the mayor or county leader is back.
 */
export async function lookupResponsible(
  lon: number,
  lat: number,
  onPartial?: (r: Responsible) => void,
): Promise<Responsible | null> {
  const jurisdiction = await lookupJurisdiction(lon, lat);
  if (!jurisdiction) return null;
  const file = await loadStateFile(jurisdiction.state.abbr).catch(() => null);
  const responsible: Responsible = {
    jurisdiction,
    local: jurisdiction.local ? { label: jurisdiction.local.label, body: governingBody(jurisdiction.local.kind) } : null,
    county: jurisdiction.county?.governs ? { label: jurisdiction.county.name, body: governingBody('county') } : null,
    state: file ? matchLegislators(jurisdiction, file) : [],
    federal: file ? matchCongress(jurisdiction, file) : [],
  };
  onPartial?.(structuredClone(responsible));

  const heads = await loadHeads([jurisdiction.local?.gnis ?? '', jurisdiction.county?.gnis ?? '']).catch(
    () => new Map<string, HeadOfGovernment | undefined>(),
  );
  const fill = (target: { official?: Official; website?: string } | null, area: Area | null, kind: string) => {
    const head = area ? heads.get(area.gnis) : undefined;
    if (!target || !head) return;
    if (head.head) {
      target.official = { role: officeTitle(head.office, kind), name: head.head, source: 'Wikidata' };
      if (head.headUrl) target.official.url = head.headUrl;
    }
    if (head.website) target.website = head.website;
  };
  fill(responsible.local, jurisdiction.local, jurisdiction.local?.kind ?? '');
  fill(responsible.county, jurisdiction.county, 'county');
  return responsible;
}
