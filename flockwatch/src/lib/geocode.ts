/**
 * Address search and reverse lookup with Photon (photon.komoot.io), an
 * OpenStreetMap geocoder built for search-as-you-type. (Nominatim, the other
 * OSM geocoder, forbids autocomplete on its public server, and Esri's needs
 * an access token.) Photon's free server can take a few seconds to answer,
 * so the address boxes also suggest cities instantly from src/lib/places.ts.
 */

import { haversine, type LngLat } from './geo';

export interface Place {
  /** First line, e.g. "1600 Pennsylvania Avenue Northwest" or "Hartsfield-Jackson Atlanta International Airport". */
  label: string;
  /** Second line, e.g. "Washington, DC 20500". */
  detail: string;
  lon: number;
  lat: number;
  /** What it is, for the suggestion's icon: a city or other area, a street, a named place, or an address. */
  kind?: 'area' | 'street' | 'place' | 'address';
}

const PHOTON = 'https://photon.komoot.io';
/** The U.S. and its territories with roads people drive. */
const COUNTRIES = new Set(['US', 'PR', 'VI', 'GU']);

/** State and territory names to postal codes. */
export const STATE_ABBR: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT',
  Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL',
  Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT',
  Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA',
  'Puerto Rico': 'PR', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN',
  Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV',
  Wisconsin: 'WI', Wyoming: 'WY',
};

interface PhotonProperties {
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  town?: string;
  village?: string;
  district?: string;
  county?: string;
  state?: string;
  postcode?: string;
  countrycode?: string;
  /** house, street, locality, district, city, county, state, country or other */
  type?: string;
  osm_key?: string;
  osm_value?: string;
}

const AREA_TYPES = new Set(['locality', 'district', 'city', 'county', 'state', 'country']);
/** Landforms and waters too big to drive to ("Atlantic Coastal Plain"), and whole states. Beaches, peaks and parks stay. */
const NOT_DESTINATIONS = new Set(['plain', 'valley', 'ridge', 'water', 'bay', 'strait', 'coastline', 'wetland', 'glacier', 'sea', 'ocean', 'region', 'continent', 'archipelago']);

export interface PhotonResponse {
  features?: Array<{ geometry: { coordinates: [number, number] }; properties: PhotonProperties }>;
}

/** Turns Photon's results into U.S. places with readable two-line labels, without duplicates. */
export function toPlaces(json: PhotonResponse): Place[] {
  const out: Place[] = [];
  const seen = new Set<string>();
  for (const f of json.features ?? []) {
    const p = f.properties;
    if (!COUNTRIES.has((p.countrycode ?? '').toUpperCase())) continue;
    if (p.type === 'state' || p.type === 'country' || p.osm_key === 'waterway' || NOT_DESTINATIONS.has(p.osm_value ?? '')) continue;
    const street = p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street;
    const town = p.city ?? p.town ?? p.village ?? p.district;
    const state = p.state ? (STATE_ABBR[p.state] ?? p.state) : undefined;
    const label = p.name ?? street ?? town ?? p.county ?? '';
    if (!label) continue;
    const parts = [label !== street ? street : undefined, label !== town ? town : undefined, state]
      .filter((x): x is string => Boolean(x));
    let detail = parts.join(', ');
    if (p.postcode && street) detail = `${detail} ${p.postcode}`.trim();
    const key = `${label}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const [lon, lat] = f.geometry.coordinates;
    // The same name a few hundred meters apart is one place mapped several times (a mall, its bus stop, its garage).
    if (out.some((o) => o.label === label && haversine([o.lon, o.lat], [lon, lat]) < 400)) continue;
    const kind = AREA_TYPES.has(p.type ?? '') ? 'area' : p.type === 'street' ? 'street' : p.name ? 'place' : 'address';
    out.push({ label, detail, lon, lat, kind });
  }
  return out;
}

/** The Photon request for a search: U.S. results only, nearest to `near` first when given. */
export function photonParams(query: string, near?: LngLat): URLSearchParams {
  const params = new URLSearchParams({ q: query.trim(), limit: '10', lang: 'en', countrycode: 'US' });
  if (near) {
    params.set('lon', near[0].toFixed(3));
    params.set('lat', near[1].toFixed(3));
  }
  return params;
}

const searchCache = new Map<string, Promise<Place[]>>();

/** Places matching `query`, nearest to `near` first when given. Results are cached for the visit. */
export function searchPlaces(query: string, near?: LngLat): Promise<Place[]> {
  const key = photonParams(query, near).toString();
  let hit = searchCache.get(key);
  if (!hit) {
    hit = fetch(`${PHOTON}/api/?${key}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Address search failed (${r.status})`);
        return r.json() as Promise<PhotonResponse>;
      })
      .then((json) => toPlaces(json).slice(0, 7));
    hit.catch(() => searchCache.delete(key));
    searchCache.set(key, hit);
  }
  return hit;
}

/**
 * Labels a point by its street ("Near 675 Ponce de Leon Avenue Northeast")
 * rather than whatever shop happens to be closest. Keeps the point itself, not
 * the address's coordinates.
 */
export function nearbyPlace(json: PhotonResponse, lon: number, lat: number): Place | null {
  const withStreet = (json.features ?? []).find(
    (f) => COUNTRIES.has((f.properties.countrycode ?? '').toUpperCase()) && f.properties.street,
  );
  if (withStreet) {
    const p = withStreet.properties;
    const town = p.city ?? p.town ?? p.village ?? p.district;
    const state = p.state ? (STATE_ABBR[p.state] ?? p.state) : undefined;
    return {
      label: `Near ${p.housenumber ? `${p.housenumber} ` : ''}${p.street}`,
      detail: [town, state].filter(Boolean).join(', '),
      lon,
      lat,
    };
  }
  const place = toPlaces(json)[0];
  return place ? { ...place, label: `Near ${place.label}`, lon, lat } : null;
}

/** The nearest address to a point, for labeling "My location" and shared links. */
export async function reversePlace(lon: number, lat: number): Promise<Place | null> {
  const params = new URLSearchParams({ lon: lon.toFixed(6), lat: lat.toFixed(6), limit: '5', lang: 'en' });
  const res = await fetch(`${PHOTON}/reverse?${params}`);
  if (!res.ok) return null;
  return nearbyPlace((await res.json()) as PhotonResponse, lon, lat);
}
