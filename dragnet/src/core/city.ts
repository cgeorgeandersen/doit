/**
 * Port Avery: a made-up city on a street grid, cut in two by a river with three
 * bridges. Avenues run north–south and are named after trees; streets run
 * east–west. Distances are meters, with north at the top.
 *
 * Everything that watches the city is placed here too: plate reader cameras
 * at intersections, gunshot microphones on rooftops, and the CCTV cameras whose
 * stills feed face recognition.
 */
import { hash, Rng } from './rng';

export const COLS = 13;
export const ROWS = 10;
export const BLOCK_W = 160;
export const BLOCK_H = 130;
export const WIDTH = (COLS - 1) * BLOCK_W;
export const HEIGHT = (ROWS - 1) * BLOCK_H;
/** Blocks in this row lie under the river. */
export const RIVER_ROW = 6;
export const BRIDGE_COLS = [2, 6, 10] as const;

export const AVENUES = [
  'Alder Ave', 'Birch Ave', 'Cedar Ave', 'Dogwood Ave', 'Elm Ave', 'Fir Ave', 'Ginkgo Ave',
  'Hawthorn Ave', 'Ironwood Ave', 'Juniper Ave', 'Linden Ave', 'Maple Ave', 'Oak Ave',
] as const;
export const STREETS = [
  '1st St', '2nd St', '3rd St', '4th St', '5th St', '6th St', 'River Rd', 'Front St', 'Mill St', 'Harbor Rd',
] as const;

export type District = 'Northgate' | 'Old Town' | 'Eastside' | 'Westfield' | 'Riverside' | 'Harbor';

export type PlaceKind =
  | 'home' | 'apartment' | 'work' | 'shop' | 'religion' | 'health' | 'civic' | 'school' | 'bar' | 'gym'
  | 'park' | 'motel' | 'legal' | 'shelter' | 'union' | 'parking' | 'transit' | 'outside';

/** What a visit to a place can reveal about a person. */
export type Sensitive =
  | 'religion' | 'health' | 'reproductive' | 'mental-health' | 'addiction' | 'union' | 'immigration'
  | 'legal' | 'sexuality' | 'shelter' | 'guns' | 'cannabis' | 'protest' | 'press' | 'police';

export interface Place {
  id: number;
  /** A stable handle for scripted characters and cases. */
  key: string;
  name: string;
  kind: PlaceKind;
  district: District | 'Out of town';
  x: number;
  y: number;
  /** The intersection a car uses to reach it. */
  node: number;
  address: string;
  tags: Sensitive[];
  /** Homes: how many households live here. */
  units: number;
  /** County records keep this address confidential. */
  confidential?: boolean;
  /** Workplaces: roughly how many people work here. */
  jobs: number;
}

export interface Camera {
  id: number;
  node: number;
  name: string;
  x: number;
  y: number;
  /** Direction the camera faces, degrees clockwise from north; decorative. */
  heading: number;
}

export interface Sensor {
  id: number;
  x: number;
  y: number;
}

export interface Cctv {
  id: number;
  key: string;
  name: string;
  place: number;
  x: number;
  y: number;
  /** 0–1: how much detail a still from this camera keeps. */
  quality: number;
}

export interface City {
  places: Place[];
  byKey: Map<string, Place>;
  cameras: Camera[];
  cameraAtNode: Int16Array;
  sensors: Sensor[];
  cctv: Cctv[];
  parks: { bi: number; bj: number; name: string }[];
  /** Hop distance between every pair of nodes. */
  dist: Uint8Array;
  neighbors: number[][];
}

export function nodeIndex(i: number, j: number): number {
  return j * COLS + i;
}

export function nodeXY(n: number): { x: number; y: number; i: number; j: number } {
  const i = n % COLS;
  const j = Math.floor(n / COLS);
  return { x: i * BLOCK_W, y: j * BLOCK_H, i, j };
}

export function nodeName(n: number): string {
  const { i, j } = nodeXY(n);
  return `${AVENUES[i]} & ${STREETS[j]}`;
}

/** The name of the intersection nearest a point. */
export function intersectionNear(x: number, y: number): string {
  const i = Math.max(0, Math.min(COLS - 1, Math.round(x / BLOCK_W)));
  const j = Math.max(0, Math.min(ROWS - 1, Math.round(y / BLOCK_H)));
  return nodeName(nodeIndex(i, j));
}

export function districtOf(bi: number, bj: number): District {
  if (bj >= RIVER_ROW + 1) return bi <= 5 ? 'Riverside' : 'Harbor';
  if (bi >= 8) return 'Eastside';
  if (bi <= 3) return bj <= 2 ? 'Northgate' : 'Westfield';
  return bj <= 1 ? 'Northgate' : 'Old Town';
}

/** The district a point falls in, or null for the river. */
export function districtAt(x: number, y: number): District | null {
  const bi = Math.min(COLS - 2, Math.max(0, Math.floor(x / BLOCK_W)));
  const bj = Math.min(ROWS - 2, Math.max(0, Math.floor(y / BLOCK_H)));
  if (bj === RIVER_ROW) return null;
  return districtOf(bi, bj);
}

function hasEdge(a: number, b: number): boolean {
  const pa = nodeXY(a);
  const pb = nodeXY(b);
  if (pa.i !== pb.i) return true;
  const top = Math.min(pa.j, pb.j);
  if (top === RIVER_ROW) return (BRIDGE_COLS as readonly number[]).includes(pa.i);
  return true;
}

function buildGraph(): { neighbors: number[][]; dist: Uint8Array } {
  const n = COLS * ROWS;
  const neighbors: number[][] = [];
  for (let k = 0; k < n; k++) {
    const { i, j } = nodeXY(k);
    const list: number[] = [];
    const candidates: [number, number][] = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]];
    for (const [ci, cj] of candidates) {
      if (ci < 0 || cj < 0 || ci >= COLS || cj >= ROWS) continue;
      const other = nodeIndex(ci, cj);
      if (hasEdge(k, other)) list.push(other);
    }
    neighbors.push(list);
  }
  const dist = new Uint8Array(n * n).fill(255);
  const queue = new Int16Array(n);
  for (let s = 0; s < n; s++) {
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    dist[s * n + s] = 0;
    while (head < tail) {
      const cur = queue[head++] as number;
      const d = dist[s * n + cur] as number;
      for (const nb of neighbors[cur] as number[]) {
        if (dist[s * n + nb] === 255) {
          dist[s * n + nb] = d + 1;
          queue[tail++] = nb;
        }
      }
    }
  }
  return { neighbors, dist };
}

/**
 * The intersections from a to b. Where several shortest routes exist, `habit`
 * picks one, so the same driver takes the same way to work every day (which is
 * exactly what makes plate reader histories so revealing).
 */
export function route(city: City, a: number, b: number, habit: number): number[] {
  const n = COLS * ROWS;
  const path = [a];
  let cur = a;
  let guard = 0;
  while (cur !== b && guard++ < 200) {
    const want = (city.dist[cur * n + b] as number) - 1;
    const options = (city.neighbors[cur] as number[]).filter((nb) => city.dist[nb * n + b] === want);
    if (options.length === 0) break;
    cur = options[hash(habit, cur, b) % options.length] as number;
    path.push(cur);
  }
  return path;
}

export function edgeLength(a: number, b: number): number {
  const pa = nodeXY(a);
  const pb = nodeXY(b);
  return Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y);
}

// ---------------------------------------------------------------------------
// Places

interface Landmark {
  key: string;
  name: string;
  kind: PlaceKind;
  block: [number, number];
  tags?: Sensitive[];
  jobs?: number;
  confidential?: boolean;
}

/** Named places. Their blocks get these instead of houses. */
const LANDMARKS: Landmark[] = [
  // Old Town
  { key: 'city-hall', name: 'Port Avery City Hall', kind: 'civic', block: [5, 3], tags: ['protest'], jobs: 30 },
  { key: 'police-hq', name: 'Port Avery Police Headquarters', kind: 'civic', block: [6, 3], tags: ['police'], jobs: 40 },
  { key: 'courthouse', name: 'County Courthouse', kind: 'civic', block: [5, 4], tags: ['legal'], jobs: 20 },
  { key: 'watch-store', name: 'Halvorsen Watch Co.', kind: 'shop', block: [4, 4], jobs: 4 },
  { key: 'ledger', name: 'The Port Avery Ledger', kind: 'work', block: [7, 4], tags: ['press'], jobs: 10 },
  { key: 'post-office', name: 'Port Avery Post Office', kind: 'work', block: [7, 4], jobs: 12 },
  { key: 'transit', name: 'Transit Center', kind: 'transit', block: [6, 5], jobs: 8 },
  { key: 'lantern', name: 'The Lantern (bar)', kind: 'bar', block: [7, 3], jobs: 6 },
  { key: 'gym', name: 'Iron Works Gym', kind: 'gym', block: [4, 3], jobs: 5 },
  { key: 'rainbow-room', name: 'The Rainbow Room (bar)', kind: 'bar', block: [7, 5], tags: ['sexuality'], jobs: 5 },
  { key: 'dr-lin', name: 'Dr. Grace Lin, Psychiatry', kind: 'health', block: [4, 5], tags: ['mental-health'], jobs: 3 },
  { key: 'dispensary', name: 'Bright Leaf Dispensary', kind: 'shop', block: [5, 5], tags: ['cannabis'], jobs: 4 },
  { key: 'family-law', name: 'Kovac & Patel Family Law', kind: 'legal', block: [4, 2], tags: ['legal'], jobs: 6 },
  { key: 'meridian', name: 'Meridian Tower (offices)', kind: 'work', block: [5, 2], jobs: 70 },
  { key: 'bank', name: 'Harbor Trust Bank', kind: 'work', block: [7, 2], jobs: 25 },
  { key: 'market', name: 'Old Town Market', kind: 'shop', block: [6, 4], jobs: 12 },
  { key: 'cafe', name: 'Second Cup Café', kind: 'shop', block: [6, 4], jobs: 5 },
  // Northgate
  { key: 'temple', name: 'Temple Beth Shalom', kind: 'religion', block: [2, 0], tags: ['religion'], jobs: 2 },
  { key: 'elementary', name: 'Northgate Elementary School', kind: 'school', block: [5, 1], jobs: 25 },
  { key: 'greenhill', name: 'Greenhill Market', kind: 'shop', block: [6, 0], jobs: 15 },
  { key: 'northgate-medical', name: 'Northgate Medical Group', kind: 'health', block: [7, 1], tags: ['health'], jobs: 15 },
  // Eastside
  { key: 'masjid', name: 'Masjid al-Noor', kind: 'religion', block: [9, 2], tags: ['religion'], jobs: 2 },
  { key: 'rec-center', name: 'Eastside Rec Center', kind: 'gym', block: [10, 3], jobs: 6 },
  { key: 'high-school', name: 'Eastside High School', kind: 'school', block: [9, 0], jobs: 35 },
  { key: 'quik-stop', name: 'Quik Stop (convenience store)', kind: 'shop', block: [10, 5], jobs: 4 },
  { key: 'laundromat', name: 'Suds Laundromat', kind: 'shop', block: [11, 4], jobs: 2 },
  { key: 'taqueria', name: 'Taquería El Faro', kind: 'shop', block: [8, 3], jobs: 6 },
  { key: 'eastside-clinic', name: 'Eastside Community Health', kind: 'health', block: [11, 1], tags: ['health'], jobs: 10 },
  // Westfield
  { key: 'hospital', name: "St. Mary's Hospital", kind: 'health', block: [1, 4], tags: ['health'], jobs: 90 },
  { key: 'baptist', name: 'Westfield Baptist Church', kind: 'religion', block: [2, 3], tags: ['religion'], jobs: 2 },
  { key: 'valumart', name: 'ValuMart', kind: 'shop', block: [0, 5], jobs: 45 },
  { key: 'gun-shop', name: 'Westfield Sporting & Arms', kind: 'shop', block: [3, 5], tags: ['guns'], jobs: 4 },
  { key: 'middle-school', name: 'Westfield Middle School', kind: 'school', block: [3, 3], jobs: 25 },
  // Riverside
  { key: 'womens-health', name: "Riverside Women's Health Center", kind: 'health', block: [4, 7], tags: ['reproductive', 'health'], jobs: 12 },
  { key: 'st-brendan', name: "St. Brendan's Church", kind: 'religion', block: [2, 7], tags: ['religion'], jobs: 3 },
  { key: 'union-hall', name: 'Harbor Workers Union, Local 19', kind: 'union', block: [1, 8], tags: ['union'], jobs: 4 },
  { key: 'shelter', name: 'Safe Harbor House', kind: 'shelter', block: [3, 8], tags: ['shelter'], jobs: 6, confidential: true },
  { key: 'legal-aid', name: 'Riverside Legal Aid (immigration)', kind: 'legal', block: [5, 8], tags: ['immigration', 'legal'], jobs: 6 },
  { key: 'recovery', name: 'Riverside Recovery Clinic', kind: 'health', block: [0, 7], tags: ['addiction', 'health'], jobs: 8 },
  // Harbor
  { key: 'terminal', name: 'Port Avery Container Terminal', kind: 'work', block: [10, 8], jobs: 80 },
  { key: 'cannery', name: 'Bayside Cannery', kind: 'work', block: [8, 8], jobs: 60 },
  { key: 'motel', name: 'Harbor Motel', kind: 'motel', block: [7, 7], jobs: 4 },
  { key: 'pier-9', name: 'Pier 9 parking lot', kind: 'parking', block: [9, 8] },
  { key: 'dockside', name: 'Dockside Tavern', kind: 'bar', block: [8, 7], jobs: 6 },
  { key: 'warehouses', name: 'Mill Street Warehouses', kind: 'work', block: [10, 7], jobs: 40 },
  { key: 'fuel', name: 'Harbor Fuel', kind: 'shop', block: [6, 7], jobs: 4 },
];

const PARKS: { bi: number; bj: number; name: string }[] = [
  { bi: 6, bj: 2, name: 'Commons Park' },
  { bi: 1, bj: 1, name: 'Northgate Park' },
  { bi: 2, bj: 8, name: 'Riverside Park' },
];

/** Plate reader camera intersections: [avenue index, street index]. */
const CAMERA_NODES: [number, number][] = [
  // where roads enter the city
  [0, 4], [6, 0], [12, 3], [0, 8], [12, 8],
  // the bridges
  [2, 7], [6, 6], [10, 7],
  // Old Town
  [5, 3], [6, 4], [4, 5], [7, 2], [5, 5], [7, 5],
  // Eastside
  [8, 1], [9, 3], [10, 2], [11, 4], [10, 5], [8, 4], [11, 1],
  // Westfield
  [1, 3], [3, 4],
  // Northgate
  [2, 2], [5, 1],
  // Riverside
  [1, 7], [4, 8], [3, 7],
  // Harbor
  [8, 8], [9, 7],
];

/** Where people come and go from out of town. */
const GATES: { key: string; name: string; node: [number, number]; dx: number; dy: number }[] = [
  { key: 'out-west', name: 'Out of town (Route 9 west)', node: [0, 4], dx: -90, dy: 0 },
  { key: 'out-north', name: 'Out of town (Highway 12 north)', node: [6, 0], dx: 0, dy: -90 },
  { key: 'out-east', name: 'Out of town (Route 9 east)', node: [12, 3], dx: 90, dy: 0 },
];

/** Houses per block, by district. Eastside and Old Town have apartment buildings instead. */
const HOMES_PER_BLOCK: Record<District, number> = {
  Northgate: 4,
  Westfield: 5,
  'Old Town': 1,
  Eastside: 3,
  Riverside: 5,
  Harbor: 0,
};

function lotPositions(bi: number, bj: number, count: number): { x: number; y: number }[] {
  const x0 = bi * BLOCK_W + 22;
  const y0 = bj * BLOCK_H + 22;
  const w = BLOCK_W - 44;
  const h = BLOCK_H - 44;
  const cols = count <= 2 ? count : count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k < count; k++) {
    const c = k % cols;
    const r = Math.floor(k / cols);
    out.push({ x: x0 + (w * (c + 0.5)) / cols, y: y0 + (h * (r + 0.5)) / rows });
  }
  return out;
}

/** The corner of a block nearest a point. */
function accessNode(bi: number, bj: number, x: number, y: number): number {
  const i = x - bi * BLOCK_W < BLOCK_W / 2 ? bi : bi + 1;
  const j = y - bj * BLOCK_H < BLOCK_H / 2 ? bj : bj + 1;
  return nodeIndex(i, j);
}

/** A street address for a point inside block (bi, bj), fronting the nearest road. */
function addressFor(bi: number, bj: number, x: number, y: number, salt: number): string {
  const fx = (x - bi * BLOCK_W) / BLOCK_W;
  const fy = (y - bj * BLOCK_H) / BLOCK_H;
  const toAvenue = Math.min(fx, 1 - fx) * BLOCK_W;
  const toStreet = Math.min(fy, 1 - fy) * BLOCK_H;
  const odd = salt % 2;
  if (toAvenue < toStreet) {
    const avenue = fx < 0.5 ? bi : bi + 1;
    const number = bj * 100 + 2 + Math.round(fy * 90) * 1 + odd;
    return `${number} ${AVENUES[avenue]}`;
  }
  const street = fy < 0.5 ? bj : bj + 1;
  const number = bi * 100 + 2 + Math.round(fx * 90) + odd;
  return `${number} ${STREETS[street]}`;
}

export function buildCity(seed: number): City {
  const rng = new Rng(hash(seed, 'city'));
  const places: Place[] = [];
  const byKey = new Map<string, Place>();
  const usedAddresses = new Set<string>();

  const add = (p: Omit<Place, 'id'>): Place => {
    let address = p.address;
    let bump = 0;
    while (usedAddresses.has(address) && bump < 20) {
      bump++;
      address = address.replace(/^(\d+)/, (m) => String(Number(m) + 2 * bump));
    }
    usedAddresses.add(address);
    const place: Place = { ...p, address, id: places.length };
    places.push(place);
    byKey.set(place.key, place);
    return place;
  };

  const landmarksByBlock = new Map<string, Landmark[]>();
  for (const lm of LANDMARKS) {
    const k = `${lm.block[0]},${lm.block[1]}`;
    landmarksByBlock.set(k, [...(landmarksByBlock.get(k) ?? []), lm]);
  }
  const parkBlocks = new Set(PARKS.map((p) => `${p.bi},${p.bj}`));

  for (let bj = 0; bj < ROWS - 1; bj++) {
    if (bj === RIVER_ROW) continue;
    for (let bi = 0; bi < COLS - 1; bi++) {
      const district = districtOf(bi, bj);
      const blockKey = `${bi},${bj}`;
      if (parkBlocks.has(blockKey)) continue;
      const landmarks = landmarksByBlock.get(blockKey) ?? [];
      const homes = landmarks.length > 0 ? Math.max(0, Math.min(2, HOMES_PER_BLOCK[district] - 3)) : HOMES_PER_BLOCK[district];
      const total = landmarks.length + homes;
      if (total === 0) continue;
      const lots = lotPositions(bi, bj, total);
      landmarks.forEach((lm, k) => {
        const pos = lots[k] as { x: number; y: number };
        add({
          key: lm.key,
          name: lm.name,
          kind: lm.kind,
          district,
          x: pos.x,
          y: pos.y,
          node: accessNode(bi, bj, pos.x, pos.y),
          address: addressFor(bi, bj, pos.x, pos.y, k),
          tags: lm.tags ?? [],
          units: 0,
          jobs: lm.jobs ?? 0,
          confidential: lm.confidential,
        });
      });
      for (let k = 0; k < homes; k++) {
        const pos = lots[landmarks.length + k] as { x: number; y: number };
        const apartment = district === 'Eastside' || district === 'Old Town';
        const address = addressFor(bi, bj, pos.x, pos.y, k + landmarks.length);
        add({
          key: `home-${bi}-${bj}-${k}`,
          name: apartment ? `${address} (apartments)` : address,
          kind: apartment ? 'apartment' : 'home',
          district,
          x: pos.x,
          y: pos.y,
          node: accessNode(bi, bj, pos.x, pos.y),
          address,
          tags: [],
          units: apartment ? rng.int(2, 4) : rng.chance(0.15) ? 2 : 1,
          jobs: 0,
        });
      }
    }
  }

  for (const gate of GATES) {
    const node = nodeIndex(gate.node[0], gate.node[1]);
    const { x, y } = nodeXY(node);
    add({
      key: gate.key,
      name: gate.name,
      kind: 'outside',
      district: 'Out of town',
      x: x + gate.dx,
      y: y + gate.dy,
      node,
      address: gate.name,
      tags: [],
      units: 0,
      jobs: 0,
    });
  }

  const cameras: Camera[] = [];
  const cameraAtNode = new Int16Array(COLS * ROWS).fill(-1);
  CAMERA_NODES.forEach(([i, j], id) => {
    const node = nodeIndex(i, j);
    const { x, y } = nodeXY(node);
    cameraAtNode[node] = id;
    cameras.push({ id, node, name: nodeName(node), x, y, heading: (hash(seed, 'cam', id) % 4) * 90 });
  });

  // Gunshot microphones cover only Eastside and the Harbor: the city chose
  // where to listen, which decides where alerts (and armed responses) happen.
  const sensors: Sensor[] = [];
  for (let k = 0; k < 4; k++) {
    for (let m = 0; m < 3; m++) {
      sensors.push({ id: sensors.length, x: 8.4 * BLOCK_W + k * 0.95 * BLOCK_W, y: 0.6 * BLOCK_H + m * 2.1 * BLOCK_H });
    }
  }
  for (let k = 0; k < 4; k++) {
    sensors.push({ id: sensors.length, x: 6.6 * BLOCK_W + k * 1.4 * BLOCK_W, y: 8.1 * BLOCK_H });
  }

  const cctvSpec: { key: string; name: string; place: string; quality: number }[] = [
    { key: 'cctv-watch', name: 'Halvorsen Watch Co., sales floor', place: 'watch-store', quality: 0.34 },
    { key: 'cctv-plaza', name: 'City Hall plaza', place: 'city-hall', quality: 0.55 },
    { key: 'cctv-transit', name: 'Transit Center, platform', place: 'transit', quality: 0.62 },
    { key: 'cctv-motel', name: 'Harbor Motel, lobby', place: 'motel', quality: 0.45 },
    { key: 'cctv-quik', name: 'Quik Stop, register', place: 'quik-stop', quality: 0.5 },
  ];
  const cctv: Cctv[] = cctvSpec.map((c, id) => {
    const place = byKey.get(c.place) as Place;
    return { id, key: c.key, name: c.name, place: place.id, x: place.x + 10, y: place.y - 10, quality: c.quality };
  });

  const { neighbors, dist } = buildGraph();
  return { places, byKey, cameras, cameraAtNode, sensors, cctv, parks: PARKS, dist, neighbors };
}

export function placeByKey(city: City, key: string): Place {
  const place = city.byKey.get(key);
  if (!place) throw new Error(`No place called ${key}`);
  return place;
}
