/**
 * The people of Port Avery, their cars and their phones. None of them exist.
 * Each person gets a home, maybe a job, a set of weekly habits (worship, gym,
 * a bar on Fridays, a therapist on Thursdays), and a face, stored the way face
 * recognition stores one: as a list of numbers.
 */
import type { City, Place } from './city';
import { hash, Rng, rngFor } from './rng';

export const FACE_DIMS = 64;

export type Shift = 'day' | 'early' | 'late' | 'night';
export type VehicleType = 'sedan' | 'SUV' | 'pickup' | 'minivan' | 'hatchback' | 'wagon' | 'van' | 'coupe';

export interface Job {
  place: number;
  title: string;
  shift: Shift;
  /** Weekdays worked, 0 = Sunday. */
  days: number[];
}

export interface Routine {
  place: number;
  label: string;
  /** Weekdays it can happen on. */
  days: number[];
  /** Minute of day. */
  start: number;
  duration: number;
  /** Chance it happens on an eligible day. */
  prob: number;
  /** Only on even or odd weeks (every other Thursday, say). */
  weeks?: 'even' | 'odd';
  /** One-off: only on these days, whatever `days` says. */
  onDays?: number[];
}

export interface Vehicle {
  id: number;
  plate: string;
  make: string;
  model: string;
  type: VehicleType;
  color: string;
  year: number;
  features: string[];
  owner: number;
  /** Out-of-town plates use another state's format. */
  outOfState: boolean;
  /** Someone else drives it from this time on (it was stolen). */
  takenBy?: { person: number; at: number };
}

export interface Phone {
  imsi: string;
  number: string;
  carrier: string;
  /** Advertising ID, the "anonymous" key location data is sold under. */
  adId: string;
  /** Has apps that sell location data. */
  apps: boolean;
  /** Logs workouts, which records a dense GPS trail. */
  fitness: boolean;
  /** Carries it switched on. */
  carried: boolean;
}

export interface HomeSpell {
  fromDay: number;
  place: number;
}

export interface Person {
  id: number;
  /** Scripted characters have a key. */
  key?: string;
  first: string;
  last: string;
  age: number;
  /** Where they live, by day; usually one spell. */
  homes: HomeSpell[];
  unit: string;
  resident: boolean;
  job: Job | null;
  vehicle: number | null;
  phone: Phone;
  face: Float32Array;
  /** Has a driver's license photo on file (with face recognition, that's the DMV gallery). */
  license: boolean;
  /** Has a booking photo on file. */
  mugshot: boolean;
  mugshotNote?: string;
  routines: Routine[];
  partner: number | null;
  /** Visitors from out of town: which days they come. */
  visitDays?: number[];
  handle: string | null;
  /** Picks among equally short routes, so each driver has habits. */
  habit: number;
  /** Who they are, for the dossier's "what the data doesn't know" notes. */
  bio?: string;
  /** Exists only to drive a stolen car; never listed. */
  hidden?: boolean;
}

const FIRST = [
  'James', 'Maria', 'Wei', 'Aisha', 'Daniel', 'Priya', 'Carlos', 'Emily', 'Kwame', 'Sofia', 'Michael', 'Fatima',
  'David', 'Mei', 'Luis', 'Hannah', 'Andre', 'Grace', 'Omar', 'Olivia', 'Jamal', 'Elena', 'Kevin', 'Nadia', 'Brian',
  'Rosa', 'Tyrone', 'Laura', 'Hiroshi', 'Chloe', 'Diego', 'Amara', 'Steven', 'Leila', 'Marcus', 'Julia', 'Raj',
  'Megan', 'Ibrahim', 'Ana', 'Patrick', 'Keisha', 'Thomas', 'Yuki', 'Samuel', 'Isabel', 'Eric', 'Zainab', 'Lucia',
  'Jason', 'Ngozi', 'Anthony', 'Rachel', 'Hassan', 'Camila', 'Gregory', 'Tamika', 'Victor', 'Sarah', 'Minh', 'Erin',
  'Jorge', 'Abigail', 'Darnell', 'Ayesha', 'Frank', 'Lauren', 'Ahmed', 'Monica', 'Ryan', 'Nia', 'Paul', 'Valeria',
  'Sean', 'Jasmine', 'Alejandro', 'Katherine', 'Dmitri', 'Imani', 'Gary', 'Rebecca', 'Tariq', 'Natalie', 'Joseph',
  'Esperanza', 'Kenji', 'Brianna', 'Mark', 'Lina', 'Christopher', 'Destiny', 'Ali', 'Melissa', 'William', 'Gabriela',
  'Jerome', 'Heather', 'Arjun', 'Teresa', 'Scott', 'Ebony', 'Nikolai', 'Vanessa', 'Malik', 'Diana', 'Peter', 'Rania',
  'Miguel', 'Allison', 'Kofi', 'Stephanie', 'Jun', 'Danielle', 'Andrew', 'Mariam', 'Hector', 'Ruth', 'Walter',
  'Bao', 'Yolanda', 'Roberto', 'Simone', 'Ethan', 'Noor', 'Gloria', 'Felix', 'Carmen', 'Isaac', 'Leah', 'Ravi',
];

/** Surnames of scripted characters and of real people in the cases are left out of this list. */
const LAST = [
  'Nguyen', 'Johnson', 'Garcia', 'Kim', 'Patel', 'Jones', 'Rodriguez', 'Miller', 'Chen', 'Davis', 'Martinez',
  'Wilson', 'Ali', 'Anderson', 'Lopez', 'Taylor', 'Thomas', 'Hernandez', 'Jackson', 'Gonzalez', 'Harris', 'Sanchez',
  'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Hill',
  'Flores', 'Adams', 'Nelson', 'Baker', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Phillips', 'Evans',
  'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Stewart', 'Morris', 'Murphy', 'Cook', 'Rogers',
  'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey', 'Kelly', 'Howard', 'Ramos', 'Cox', 'Ward',
  'Richardson', 'Watson', 'Wood', 'Bennett', 'Gray', 'Mendoza', 'Hughes', 'Price', 'Castillo', 'Sanders', 'Myers',
  'Ross', 'Foster', 'Jimenez', 'Powell', 'Jenkins', 'Perry', 'Russell', 'Sullivan', 'Bell', 'Coleman', 'Butler',
  'Barnes', 'Fisher', 'Vasquez', 'Simmons', 'Romero', 'Jordan', 'Patterson', 'Alexander', 'Hamilton', 'Graham',
  'Reynolds', 'Griffin', 'Wallace', 'Cole', 'Hayes', 'Chavez', 'Gibson', 'Bryant', 'Ellis', 'Stevens', 'Murray',
  'Marshall', 'Owens', 'Harrison', 'Tran', 'Le', 'Pham', 'Wang', 'Li', 'Zhang', 'Liu', 'Yang', 'Huang', 'Singh',
  'Shah', 'Khan', 'Rahman', 'Hussein', 'Mensah', 'Owusu', 'Adeyemi', 'Nwosu', 'Diallo', 'Tanaka', 'Sato',
  'Yamamoto', 'Kowalski', 'Novak', 'Petrov', 'Ivanova', 'Rossi', 'Schmidt', "O'Brien", 'Lindqvist', 'Haugen',
  'Johansson', 'Abara', 'Okonkwo', 'Salazar', 'Navarro', 'Fong', 'Dang', 'Bui', 'Farouk', 'Nasser', 'Kaur',
];

export const VEHICLE_MODELS: { make: string; model: string; type: VehicleType }[] = [
  { make: 'Toyota', model: 'Corolla', type: 'sedan' },
  { make: 'Toyota', model: 'Camry', type: 'sedan' },
  { make: 'Honda', model: 'Civic', type: 'sedan' },
  { make: 'Honda', model: 'CR-V', type: 'SUV' },
  { make: 'Ford', model: 'F-150', type: 'pickup' },
  { make: 'Subaru', model: 'Outback', type: 'wagon' },
  { make: 'Honda', model: 'Odyssey', type: 'minivan' },
  { make: 'Toyota', model: 'RAV4', type: 'SUV' },
  { make: 'Chevrolet', model: 'Silverado', type: 'pickup' },
  { make: 'Nissan', model: 'Altima', type: 'sedan' },
  { make: 'Hyundai', model: 'Elantra', type: 'sedan' },
  { make: 'Jeep', model: 'Wrangler', type: 'SUV' },
  { make: 'Tesla', model: 'Model 3', type: 'sedan' },
  { make: 'Kia', model: 'Soul', type: 'hatchback' },
  { make: 'Ford', model: 'Transit', type: 'van' },
  { make: 'Mazda', model: '3', type: 'hatchback' },
  { make: 'Toyota', model: 'Prius', type: 'hatchback' },
  { make: 'Ford', model: 'Explorer', type: 'SUV' },
  { make: 'Kia', model: 'Sorento', type: 'SUV' },
  { make: 'Toyota', model: 'Tacoma', type: 'pickup' },
  { make: 'Chrysler', model: 'Pacifica', type: 'minivan' },
  { make: 'Volkswagen', model: 'Jetta', type: 'sedan' },
  { make: 'Ford', model: 'Mustang', type: 'coupe' },
];

export const COLORS = ['white', 'black', 'silver', 'gray', 'blue', 'red', 'green', 'beige', 'brown'] as const;
export const COLOR_HEX: Record<string, string> = {
  white: '#e8eef4', black: '#2a2f36', silver: '#b8c2cc', gray: '#7f8a95', blue: '#3f6fd8', red: '#d2463f',
  green: '#3f9a5c', beige: '#d8c7a0', brown: '#8a5a3a',
};

/** What a plate reader's "vehicle fingerprint" can pick out besides the plate. */
export const FEATURES = ['roof rack', 'tow hitch', 'tinted windows', 'dented rear bumper', 'bike rack', 'missing hubcap'] as const;
export const STICKERS = [
  'COEXIST', 'Thin Blue Line flag', 'Union Strong', 'rainbow flag', 'Honor Student', '26.2', 'Jesus fish',
  'Save the Orcas', 'Eastside High Football', 'STOP THE CAMERAS',
] as const;

const CARRIERS = ['Verizon', 'T-Mobile', 'AT&T', 'Mint', 'Visible'] as const;
/** Area codes for display; every number is 555-01xx, the range set aside for fiction. */
const AREA_CODES = ['503', '360', '971', '541', '458', '206', '425', '253', '509'] as const;

const PLATE_LETTERS = 'ABCDEFGHJKLMNOPRSTUVWXYZ';

export function makePlate(rng: Rng, outOfState: boolean): string {
  const L = () => PLATE_LETTERS[rng.int(0, PLATE_LETTERS.length - 1)] as string;
  const D = () => String(rng.int(0, 9));
  return outOfState ? `${L()}${L()}${L()} ${D()}${D()}${D()}${D()}` : `${rng.int(4, 9)}${L()}${L()}${L()}${D()}${D()}${D()}`;
}

export function makeFace(rng: Rng): Float32Array {
  const face = new Float32Array(FACE_DIMS);
  for (let k = 0; k < FACE_DIMS; k++) face[k] = rng.normal();
  return face;
}

/** A face near `base`: a sibling, a lookalike, or the same person on a bad camera. */
export function nearFace(base: Float32Array, rng: Rng, spread: number): Float32Array {
  const face = new Float32Array(FACE_DIMS);
  for (let k = 0; k < FACE_DIMS; k++) face[k] = (base[k] as number) + rng.normal() * spread;
  return face;
}

function makePhone(rng: Rng, id: number, seed: number): Phone {
  const hex = (n: number) => (hash(seed, 'ad', id, n) >>> 0).toString(16).padStart(8, '0');
  const ad = `${hex(1)}-${hex(2).slice(0, 4)}-4${hex(3).slice(0, 3)}-${hex(4).slice(0, 4)}-${hex(5)}${hex(6).slice(0, 4)}`;
  const area = AREA_CODES[id % AREA_CODES.length] as string;
  const line = String(100 + (Math.floor(id / AREA_CODES.length) % 100)).padStart(4, '0');
  return {
    imsi: `310${String(260 + (id % 7) * 10)}${String(hash(seed, 'imsi', id) % 1000000000).padStart(9, '0')}`,
    number: `(${area}) 555-${line}`,
    carrier: rng.pick(CARRIERS),
    adId: ad,
    apps: rng.chance(0.72),
    fitness: rng.chance(0.12),
    carried: rng.chance(0.97),
  };
}

const JOB_TITLES: Record<string, string[]> = {
  hospital: ['nurse', 'nurse', 'physician', 'orderly', 'lab technician', 'pharmacist', 'receptionist'],
  terminal: ['longshore worker', 'crane operator', 'logistics clerk', 'truck dispatcher'],
  cannery: ['line worker', 'line worker', 'packer', 'forklift operator', 'quality inspector'],
  warehouses: ['warehouse associate', 'delivery driver', 'forklift operator', 'shift lead'],
  meridian: ['accountant', 'software developer', 'claims adjuster', 'paralegal', 'office manager', 'analyst'],
  bank: ['bank teller', 'loan officer', 'branch manager'],
  'police-hq': ['patrol officer', 'dispatcher', 'records clerk'],
  'city-hall': ['planner', 'clerk', 'permit technician'],
  courthouse: ['court clerk', 'bailiff', 'public defender'],
  school: ['teacher', 'teacher', 'teaching aide', 'custodian', 'bus driver'],
  shop: ['cashier', 'sales associate', 'stocker', 'store manager'],
  bar: ['bartender', 'server', 'line cook'],
  health: ['nurse practitioner', 'medical assistant', 'receptionist', 'counselor'],
  default: ['staff'],
};

function jobTitle(rng: Rng, place: Place): string {
  const list = JOB_TITLES[place.key] ?? JOB_TITLES[place.kind] ?? JOB_TITLES.default!;
  return rng.pick(list as string[]);
}

function shiftFor(rng: Rng, place: Place): Shift {
  if (place.key === 'hospital') return rng.weighted(['day', 'early', 'late', 'night'] as Shift[], (s) => ({ day: 4, early: 2, late: 2, night: 2 })[s]);
  if (place.key === 'terminal' || place.key === 'cannery' || place.key === 'warehouses')
    return rng.weighted(['early', 'day', 'late', 'night'] as Shift[], (s) => ({ early: 4, day: 2, late: 2, night: 1 })[s]);
  if (place.kind === 'shop' || place.kind === 'bar') return rng.weighted(['day', 'late'] as Shift[], (s) => (s === 'late' ? 2 : 3));
  return 'day';
}

export const SHIFT_HOURS: Record<Shift, [number, number]> = {
  early: [6 * 60, 14 * 60 + 30],
  day: [8 * 60 + 30, 17 * 60],
  late: [14 * 60, 22 * 60 + 30],
  night: [22 * 60, 30 * 60 + 30],
};

function workDays(rng: Rng, place: Place, shift: Shift): number[] {
  if (place.kind === 'school' || place.key === 'meridian' || place.key === 'bank' || place.kind === 'civic') return [1, 2, 3, 4, 5];
  if (shift === 'night') return [0, 1, 2, 3, 4];
  const off = rng.int(0, 6);
  const off2 = (off + rng.int(1, 3)) % 7;
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== off && d !== off2);
}

export interface PeopleBuild {
  people: Person[];
  vehicles: Vehicle[];
}

/** Places by key, kind or tag, for building habits. */
function placesWhere(city: City, test: (p: Place) => boolean): Place[] {
  return city.places.filter(test);
}

function nearest(places: Place[], from: Place): Place {
  let best = places[0] as Place;
  let bestD = Infinity;
  for (const p of places) {
    const d = Math.abs(p.x - from.x) + Math.abs(p.y - from.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function homeOn(person: Person, day: number): number {
  let place = (person.homes[0] as HomeSpell).place;
  for (const spell of person.homes) if (day >= spell.fromDay) place = spell.place;
  return place;
}

export function fullName(p: Person): string {
  return `${p.first} ${p.last}`;
}

/**
 * Builds the random population after the scripted cast (which the caller has
 * already placed at the front of `people`).
 */
export function buildPopulation(city: City, seed: number, cast: PeopleBuild, takenSurnames: Set<string>): PeopleBuild {
  const rng = new Rng(hash(seed, 'people'));
  const people = cast.people;
  const vehicles = cast.vehicles;
  const lastNames = LAST.filter((n) => !takenSurnames.has(n));
  const usedPlates = new Set(vehicles.map((v) => v.plate));

  const homes = city.places.filter((p) => p.kind === 'home' || p.kind === 'apartment');
  const occupied = new Map<number, number>();
  for (const p of people) for (const h of p.homes) occupied.set(h.place, (occupied.get(h.place) ?? 0) + 1);

  const workplaces = city.places.filter((p) => p.jobs > 0);
  const churches = placesWhere(city, (p) => p.key === 'st-brendan' || p.key === 'baptist');
  const gyms = placesWhere(city, (p) => p.kind === 'gym');
  const markets = placesWhere(city, (p) => p.key === 'market' || p.key === 'greenhill' || p.key === 'quik-stop' || p.key === 'valumart');
  const schools = placesWhere(city, (p) => p.kind === 'school');
  const bars = placesWhere(city, (p) => p.key === 'lantern' || p.key === 'dockside');
  const get = (key: string) => city.byKey.get(key) as Place;

  const newVehicle = (owner: number, outOfState: boolean): Vehicle => {
    const model = rng.pick(VEHICLE_MODELS);
    let plate = makePlate(rng, outOfState);
    while (usedPlates.has(plate)) plate = makePlate(rng, outOfState);
    usedPlates.add(plate);
    const features: string[] = [];
    for (const f of FEATURES) if (rng.chance(0.07)) features.push(f);
    for (const s of STICKERS) if (s !== 'STOP THE CAMERAS' && rng.chance(0.035)) features.push(`bumper sticker: ${s}`);
    const v: Vehicle = {
      id: vehicles.length,
      plate,
      ...model,
      color: rng.weighted([...COLORS], (c) => (c === 'white' || c === 'black' || c === 'silver' || c === 'gray' ? 3 : 1)),
      year: rng.int(2006, 2025),
      features,
      owner,
      outOfState,
    };
    vehicles.push(v);
    return v;
  };

  let household = 0;
  for (const home of rng.shuffle([...homes])) {
    const free = home.units - (occupied.get(home.id) ?? 0);
    for (let u = 0; u < free; u++) {
      household++;
      const size = rng.weighted([1, 2, 3], (s) => (s === 1 ? 4 : s === 2 ? 5 : 1));
      const last = rng.pick(lastNames);
      const unit = home.kind === 'apartment' ? `Apt ${rng.int(1, 4)}${'ABCD'[rng.int(0, 3)]}` : '';
      const kids = rng.chance(0.3);
      for (let m = 0; m < size; m++) {
        const id = people.length;
        const age = m === 2 ? rng.int(18, 24) : rng.int(22, 84);
        const prng = rngFor(seed, 'person', id);
        const retired = age >= 67 && prng.chance(0.8);
        const employed = !retired && prng.chance(0.86);
        let job: Job | null = null;
        if (employed) {
          const place = prng.weighted(workplaces, (w) => w.jobs);
          const shift = shiftFor(prng, place);
          job = { place: place.id, title: jobTitle(prng, place), shift, days: workDays(prng, place, shift) };
        }
        const person: Person = {
          id,
          first: prng.pick(FIRST),
          last,
          age,
          homes: [{ fromDay: -999, place: home.id }],
          unit,
          resident: true,
          job,
          vehicle: null,
          phone: makePhone(prng, id, seed),
          face: makeFace(prng),
          license: prng.chance(0.93),
          mugshot: prng.chance(0.11),
          routines: [],
          partner: null,
          handle: null,
          habit: hash(seed, 'habit', id),
        };
        if (prng.chance(0.5)) person.handle = makeHandle(prng, person.first, last);
        const carChance = home.district === 'Eastside' ? 0.62 : home.district === 'Northgate' ? 0.95 : 0.85;
        if (prng.chance(carChance) && (m === 0 || prng.chance(0.6))) person.vehicle = newVehicle(id, false).id;

        // habits
        const r = person.routines;
        const homePlace = home;
        if (prng.chance(0.24)) r.push({ place: prng.pick(churches).id, label: 'Sunday service', days: [0], start: 600, duration: 90, prob: 0.8 });
        else if (prng.chance(0.07)) r.push({ place: get('masjid').id, label: "Friday prayer (Jumu'ah)", days: [5], start: 780, duration: 60, prob: 0.85 });
        else if (prng.chance(0.06)) r.push({ place: get('temple').id, label: 'Shabbat service', days: [6], start: 600, duration: 100, prob: 0.75 });
        if (prng.chance(0.25)) {
          const gym = nearest(gyms, homePlace);
          const early = job?.shift === 'day' || job?.shift === 'late';
          r.push({ place: gym.id, label: 'workout', days: [1, 3, 5], start: early && prng.chance(0.4) ? 375 : 1090, duration: 70, prob: 0.7 });
        }
        if (prng.chance(0.2)) r.push({ place: prng.pick(bars).id, label: 'drinks', days: [5, 6], start: 1260, duration: 120, prob: 0.55 });
        if (prng.chance(0.04)) r.push({ place: get('rainbow-room').id, label: 'night out', days: [6], start: 1290, duration: 150, prob: 0.6 });
        if (prng.chance(0.05)) {
          const day = prng.int(1, 5);
          r.push({ place: get('dr-lin').id, label: 'appointment', days: [day], start: 990, duration: 50, prob: 0.9, weeks: prng.chance(0.5) ? 'even' : undefined });
        }
        if (prng.chance(0.035)) r.push({ place: get('st-brendan').id, label: 'evening meeting (church basement)', days: [3], start: 1140, duration: 60, prob: 0.9 });
        if (prng.chance(0.02)) r.push({ place: get('recovery').id, label: 'clinic visit', days: [1, 2, 3, 4, 5, 6], start: 430, duration: 20, prob: 0.95 });
        const blueCollar = job && ['terminal', 'cannery', 'warehouses'].includes(city.places[job.place]!.key);
        if (blueCollar && prng.chance(0.4)) r.push({ place: get('union-hall').id, label: 'union meeting', days: [4], start: 1140, duration: 90, prob: 0.8, weeks: 'even' });
        if (prng.chance(0.08)) r.push({ place: get('dispensary').id, label: 'shopping', days: [1, 2, 3, 4, 5, 6], start: 1110, duration: 15, prob: 0.12 });
        if (prng.chance(0.04)) r.push({ place: get('gun-shop').id, label: 'range / shop', days: [6], start: 660, duration: 75, prob: 0.4 });
        if (blueCollar && prng.chance(0.08)) r.push({ place: get('legal-aid').id, label: 'appointment', days: [2], start: 600, duration: 60, prob: 0.25 });
        r.push({ place: nearest(markets, homePlace).id, label: 'groceries', days: [0, 1, 2, 3, 4, 5, 6], start: job ? 1065 : 660, duration: 30, prob: 0.22 });
        if (kids && m === 0 && age < 55) {
          r.push({ place: nearest(schools, homePlace).id, label: 'school drop-off', days: [1, 2, 3, 4, 5], start: 470, duration: 10, prob: 0.9 });
        }
        if (prng.chance(0.03)) {
          const day = prng.int(1, 29);
          r.push({ place: get('womens-health').id, label: 'appointment', days: [], onDays: [day], start: 600 + prng.int(0, 300), duration: 60, prob: 1 });
        }
        people.push(person);
      }
    }
  }

  // partners who live apart, and stay over
  const singles = people.filter((p) => p.resident && !p.key && p.age < 60);
  for (const p of singles) {
    if (p.partner !== null || !rngFor(seed, 'partner?', p.id).chance(0.1)) continue;
    const other = singles[rngFor(seed, 'partner', p.id).int(0, singles.length - 1)] as Person;
    if (other.id === p.id || other.partner !== null || homeOn(other, 0) === homeOn(p, 0)) continue;
    p.partner = other.id;
    other.partner = p.id;
  }

  // visitors: people who drive in from out of town on some days
  const gates = city.places.filter((p) => p.kind === 'outside');
  const visitTargets = workplaces.filter((w) => w.kind !== 'school');
  for (let k = 0; k < 70; k++) {
    const id = people.length;
    const prng = rngFor(seed, 'visitor', id);
    const gate = prng.pick(gates);
    const target = prng.weighted(visitTargets, (w) => (w.key === 'terminal' ? 30 : w.jobs));
    const days: number[] = [];
    const freq = prng.range(0.08, 0.5);
    for (let d = 0; d <= 30; d++) if (prng.chance(freq)) days.push(d);
    const person: Person = {
      id,
      first: prng.pick(FIRST),
      last: prng.pick(lastNames),
      age: prng.int(22, 70),
      homes: [{ fromDay: -999, place: gate.id }],
      unit: '',
      resident: false,
      job: { place: target.id, title: target.key === 'terminal' ? 'truck driver' : 'visitor', shift: 'day', days: [0, 1, 2, 3, 4, 5, 6] },
      vehicle: null,
      phone: makePhone(prng, id, seed),
      face: makeFace(prng),
      license: false,
      mugshot: prng.chance(0.05),
      routines: [],
      partner: null,
      visitDays: days,
      handle: null,
      habit: hash(seed, 'habit', id),
    };
    person.vehicle = newVehicle(id, prng.chance(0.7)).id;
    people.push(person);
  }

  return { people, vehicles };
}

export function makeHandle(rng: Rng, first: string, last: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const styles = [
    () => `${clean(first)}${clean(last)}${rng.int(1, 99)}`,
    () => `${clean(first)}_${clean(last).slice(0, 3)}`,
    () => `${clean(first).slice(0, 1)}${clean(last)}`,
    () => `the${clean(first)}${rng.int(70, 99)}`,
    () => `${clean(last)}.${clean(first)}`,
  ];
  return `@${rng.pick(styles)()}`;
}

export function vehicleLabel(v: Vehicle): string {
  return `${v.color} ${v.year} ${v.make} ${v.model}`;
}
