/**
 * The scripted characters: the people the shift's cases are about, and what
 * they did over the last month. They live in the same database as everyone
 * else and are found the same way; the cases only tell the analyst where to
 * start looking.
 */
import { type City, nodeIndex, type Place, placeByKey } from './city';
import { FACE_DIMS, makeFace, nearFace, type Person, type Phone, type Shift, type Vehicle, type VehicleType } from './people';
import { hash, Rng, rngFor } from './rng';
import type { Activity, ScriptDay } from './schedule';
import { at, TODAY, weekday } from './time';

export interface OcrOverride {
  vehicle: number;
  camera: number;
  day: number;
  text: string;
  conf: number;
}

export interface Cast {
  people: Person[];
  vehicles: Vehicle[];
  /** person id → day → script */
  scripts: Map<number, Map<number, ScriptDay>>;
  ocr: OcrOverride[];
  ids: Record<CastKey, number>;
  vehicleIds: Record<'stolen' | 'minivan' | 'jenna' | 'alyssa' | 'ruth' | 'travis' | 'calvin', number>;
  /** Filled in once the population exists. */
  immigrationList: number[];
  rallyAttendees: number[];
  burnerImsi: string;
  /** When the Corolla was taken. */
  stolenAt: number;
}

export type CastKey =
  | 'maria' | 'paul' | 'june' | 'owen' | 'travis' | 'denise' | 'marco' | 'calvin' | 'thief' | 'kyle' | 'jenna'
  | 'kessler' | 'alyssa' | 'ruth' | 'dana' | 'holloway' | 'maya' | 'tony' | 'joyrider';

export const CAST_SURNAMES = new Set([
  'Delgado', 'Henderson', 'Fenwick', 'Park', 'Lyle', 'Hall', 'Ruiz', 'Brooks', 'Tillman', 'Brennan', 'Moore',
  'Kessler', 'Grant', 'Okafor', 'Whitlock', 'Holloway', 'Chen', 'Russo', 'Whitaker', 'Mullins', 'Tran', 'Ochoa',
  'Hale', 'Whitfield', 'Danner', 'Barrett', 'Marsh',
]);

interface CastSpec {
  key: CastKey;
  first: string;
  last: string;
  age: number;
  home: string;
  unit?: string;
  resident?: boolean;
  job?: { place: string; title: string; shift?: Shift; days?: number[] };
  phone?: Partial<Phone>;
  license?: boolean;
  mugshot?: boolean;
  mugshotNote?: string;
  handle?: string;
  bio?: string;
  hidden?: boolean;
}

const SPECS: CastSpec[] = [
  { key: 'maria', first: 'Maria', last: 'Delgado', age: 34, home: 'home-1-3-0', job: { place: 'hospital', title: 'nurse', shift: 'day' }, handle: '@mdelgado_rn', bio: 'Her car was stolen from outside her house last night.' },
  { key: 'paul', first: 'Paul', last: 'Henderson', age: 41, home: 'home-4-0-0', job: { place: 'meridian', title: 'claims adjuster', shift: 'day', days: [1, 2, 3, 4] }, bio: 'Drives his kids to soccer on Fridays.' },
  { key: 'june', first: 'June', last: 'Fenwick', age: 72, home: 'home-3-1-1', bio: 'Retired schoolteacher. Her house was burglarized yesterday afternoon.' },
  { key: 'owen', first: 'Owen', last: 'Park', age: 31, home: 'home-3-0-2', phone: { apps: true, fitness: true }, handle: '@owenrides', bio: 'Software developer who works from home and rides the same loop most lunchtimes.' },
  { key: 'travis', first: 'Travis', last: 'Lyle', age: 29, home: 'motel', unit: 'Room 12', phone: { apps: true }, mugshot: true, mugshotNote: '2023 booking, theft', bio: 'Staying at the Harbor Motel.' },
  { key: 'denise', first: 'Denise', last: 'Hall', age: 52, home: 'home-0-8-0', job: { place: 'post-office', title: 'mail carrier', shift: 'day' }, phone: { apps: true }, bio: 'Has walked the same Northgate mail route for eleven years.' },
  { key: 'marco', first: 'Marco', last: 'Ruiz', age: 38, home: 'home-9-1-0', unit: 'Apt 2B', job: { place: 'warehouses', title: 'delivery driver', shift: 'day' }, phone: { apps: true } },
  { key: 'calvin', first: 'Calvin', last: 'Brooks', age: 46, home: 'home-4-8-0', job: { place: 'cannery', title: 'line supervisor', shift: 'day', days: [1, 2, 3, 4, 5] }, phone: { apps: true }, mugshot: true, mugshotNote: '2009 booking, trespassing (charges dropped)', handle: '@calvinb_pa', bio: 'Line supervisor at the cannery for 14 years. Two daughters.' },
  { key: 'thief', first: 'Wade', last: 'Tillman', age: 44, home: 'out-east', resident: false, license: false, phone: { apps: false } , bio: 'Lives two states away. Not in any database Port Avery can search.' },
  { key: 'kyle', first: 'Kyle', last: 'Brennan', age: 27, home: 'motel', unit: 'Room 7', phone: { apps: false }, mugshot: true, mugshotNote: '2024 booking, assault', bio: 'Paid cash for a week at the Harbor Motel.' },
  { key: 'jenna', first: 'Jenna', last: 'Moore', age: 36, home: 'home-2-4-0', job: { place: 'northgate-medical', title: 'medical assistant', shift: 'day', days: [1, 2, 3, 4, 5] }, phone: { apps: true }, bio: 'Left her husband, Sgt. Ray Kessler, nine days ago. Uses her own name again.' },
  { key: 'kessler', first: 'Ray', last: 'Kessler', age: 44, home: 'home-2-4-0', job: { place: 'police-hq', title: 'patrol sergeant', shift: 'day', days: [1, 2, 3, 4, 5] }, phone: { apps: true } },
  { key: 'alyssa', first: 'Alyssa', last: 'Grant', age: 24, home: 'out-west', resident: false, license: false, phone: { apps: true }, bio: 'Drove nine hours from a state where abortion is banned.' },
  { key: 'ruth', first: 'Ruth', last: 'Okafor', age: 53, home: 'home-0-0-0', job: { place: 'city-hall', title: 'city councilmember', shift: 'day', days: [1, 2, 3, 4, 5] }, phone: { apps: true }, handle: '@RuthOkaforWard3', bio: 'Councilmember for Ward 3. Leads the push to cancel the PANOPTIC contract.' },
  { key: 'dana', first: 'Dana', last: 'Whitlock', age: 50, home: 'home-5-7-0', job: { place: 'middle-school', title: 'teacher', shift: 'day' }, phone: { apps: true }, handle: '@mswhitlock' },
  { key: 'holloway', first: 'James', last: 'Holloway', age: 61, home: 'home-1-5-0', job: { place: 'baptist', title: 'pastor', shift: 'day' }, phone: { apps: true }, handle: '@PastorHolloway' },
  { key: 'maya', first: 'Maya', last: 'Chen', age: 33, home: 'home-9-4-0', unit: 'Apt 3C', job: { place: 'high-school', title: 'teacher', shift: 'day' }, phone: { apps: true }, handle: '@mayachen_pa' },
  { key: 'tony', first: 'Tony', last: 'Russo', age: 48, home: 'home-0-8-1', job: { place: 'terminal', title: 'union steward', shift: 'early' }, phone: { apps: true }, handle: '@TonyLocal19' },
  { key: 'joyrider', first: 'Unknown', last: 'driver', age: 19, home: 'out-west', resident: false, license: false, phone: { carried: false, apps: false }, hidden: true },
];

interface VehicleSpec {
  owner: CastKey;
  plate: string;
  make: string;
  model: string;
  type: VehicleType;
  color: string;
  year: number;
  features: string[];
  outOfState?: boolean;
}

const VEHICLES: Record<keyof Cast['vehicleIds'], VehicleSpec> = {
  stolen: { owner: 'maria', plate: '7KDM392', make: 'Toyota', model: 'Corolla', type: 'sedan', color: 'silver', year: 2019, features: ['dented rear bumper'] },
  minivan: { owner: 'paul', plate: '7KOM392', make: 'Honda', model: 'Odyssey', type: 'minivan', color: 'gray', year: 2021, features: ['roof rack', 'bumper sticker: Honor Student'] },
  jenna: { owner: 'jenna', plate: '8RTN227', make: 'Subaru', model: 'Outback', type: 'wagon', color: 'blue', year: 2018, features: ['bumper sticker: 26.2', 'bike rack'] },
  alyssa: { owner: 'alyssa', plate: 'LKM 4417', make: 'Honda', model: 'Civic', type: 'sedan', color: 'red', year: 2016, features: ['missing hubcap'], outOfState: true },
  ruth: { owner: 'ruth', plate: '6RTH518', make: 'Toyota', model: 'RAV4', type: 'SUV', color: 'green', year: 2020, features: ['bumper sticker: STOP THE CAMERAS'] },
  travis: { owner: 'travis', plate: '5TLV804', make: 'Ford', model: 'Ranger', type: 'pickup', color: 'white', year: 2011, features: ['tow hitch'] },
  calvin: { owner: 'calvin', plate: '6CBR771', make: 'Chevrolet', model: 'Malibu', type: 'sedan', color: 'black', year: 2014, features: [] },
};

const OTHER_CAST_CARS: { owner: CastKey; plate: string; make: string; model: string; type: VehicleType; color: string; year: number; features: string[] }[] = [
  { owner: 'kessler', plate: '9RKX140', make: 'Ford', model: 'F-150', type: 'pickup', color: 'black', year: 2022, features: ['bumper sticker: Thin Blue Line flag', 'tinted windows'] },
  { owner: 'dana', plate: '7DWH362', make: 'Toyota', model: 'Prius', type: 'hatchback', color: 'white', year: 2017, features: ['bumper sticker: COEXIST'] },
  { owner: 'marco', plate: '8MRZ915', make: 'Ford', model: 'Transit', type: 'van', color: 'white', year: 2020, features: [] },
  { owner: 'maya', plate: '8MCH208', make: 'Mazda', model: '3', type: 'hatchback', color: 'red', year: 2019, features: ['bumper sticker: STOP THE CAMERAS'] },
  { owner: 'tony', plate: '6TRS559', make: 'Chevrolet', model: 'Silverado', type: 'pickup', color: 'blue', year: 2016, features: ['bumper sticker: Union Strong'] },
  { owner: 'holloway', plate: '5JHL630', make: 'Toyota', model: 'Camry', type: 'sedan', color: 'beige', year: 2012, features: ['bumper sticker: Jesus fish'] },
];

function n(i: number, j: number): number {
  return nodeIndex(i, j);
}

export function buildCast(city: City, seed: number): Cast {
  const people: Person[] = [];
  const vehicles: Vehicle[] = [];
  const ids = {} as Record<CastKey, number>;
  const place = (key: string): Place => placeByKey(city, key);

  for (const spec of SPECS) {
    const id = people.length;
    const prng = rngFor(seed, 'cast', spec.key);
    const hex = (k: number) => hash(seed, 'cast-ad', spec.key, k).toString(16).padStart(8, '0');
    const phone: Phone = {
      imsi: `310260${String(hash(seed, 'cast-imsi', spec.key) % 1000000000).padStart(9, '0')}`,
      number: `(503) 555-01${String(10 + id).padStart(2, '0')}`,
      carrier: prng.pick(['Verizon', 'T-Mobile', 'AT&T']),
      adId: `${hex(1)}-${hex(2).slice(0, 4)}-4${hex(3).slice(0, 3)}-${hex(4).slice(0, 4)}-${hex(5)}${hex(6).slice(0, 4)}`,
      apps: true,
      fitness: false,
      carried: true,
      ...spec.phone,
    };
    const job = spec.job
      ? { place: place(spec.job.place).id, title: spec.job.title, shift: spec.job.shift ?? 'day', days: spec.job.days ?? [1, 2, 3, 4, 5] }
      : null;
    people.push({
      id,
      key: spec.key,
      first: spec.first,
      last: spec.last,
      age: spec.age,
      homes: [{ fromDay: -999, place: place(spec.home).id }],
      unit: spec.unit ?? '',
      resident: spec.resident ?? true,
      job,
      vehicle: null,
      phone,
      face: makeFace(prng),
      license: spec.license ?? true,
      mugshot: spec.mugshot ?? false,
      mugshotNote: spec.mugshotNote,
      routines: [],
      partner: null,
      handle: spec.handle ?? null,
      habit: hash(seed, 'habit', spec.key),
      bio: spec.bio,
      hidden: spec.hidden,
    });
    ids[spec.key] = id;
  }
  const P = (k: CastKey) => people[ids[k]] as Person;

  const vehicleIds = {} as Cast['vehicleIds'];
  const addVehicle = (spec: VehicleSpec): Vehicle => {
    const v: Vehicle = { id: vehicles.length, ...spec, owner: ids[spec.owner], outOfState: spec.outOfState ?? false };
    vehicles.push(v);
    P(spec.owner).vehicle = v.id;
    return v;
  };
  for (const [name, spec] of Object.entries(VEHICLES) as [keyof Cast['vehicleIds'], VehicleSpec][]) vehicleIds[name] = addVehicle(spec).id;
  for (const spec of OTHER_CAST_CARS) addVehicle(spec);

  // Faces: the watch store thief looks a lot like Calvin Brooks.
  const faceRng = new Rng(hash(seed, 'cast-faces'));
  P('thief').face = nearFace(P('calvin').face, faceRng, 0.36);
  if (P('thief').face.length !== FACE_DIMS) throw new Error('face size');

  // Jenna moved into the shelter nine days ago.
  P('jenna').homes.push({ fromDay: TODAY - 9, place: place('shelter').id });
  P('jenna').unit = '';

  // Habits for the cast.
  P('maria').routines.push({ place: place('valumart').id, label: 'shopping', days: [0, 6], start: 660, duration: 45, prob: 0.6 });
  P('ruth').routines.push(
    { place: place('st-brendan').id, label: 'evening meeting (church basement)', days: [3], start: 1140, duration: 60, prob: 0.95 },
    { place: place('dr-lin').id, label: 'appointment', days: [4], start: 1035, duration: 50, prob: 0.95, weeks: 'even' },
    { place: place('legal-aid').id, label: 'Saturday morning', days: [6], start: 540, duration: 180, prob: 0.9 },
    { place: place('greenhill').id, label: 'groceries', days: [0, 2], start: 1080, duration: 30, prob: 0.6 },
  );
  P('dana').routines.push({ place: place('greenhill').id, label: 'groceries', days: [0], start: 640, duration: 40, prob: 0.7 });
  P('holloway').routines.push({ place: place('baptist').id, label: 'Sunday service', days: [0], start: 570, duration: 150, prob: 1 });
  P('tony').routines.push({ place: place('union-hall').id, label: 'union meeting', days: [4], start: 1140, duration: 90, prob: 0.95, weeks: 'even' });
  P('jenna').routines.push({ place: place('rec-center').id, label: 'run', days: [2, 4], start: 1080, duration: 60, prob: 0.6 });
  P('kessler').routines.push({ place: place('lantern').id, label: 'drinks', days: [5], start: 1260, duration: 120, prob: 0.7 });
  P('calvin').routines.push({ place: place('st-brendan').id, label: 'Sunday service', days: [0], start: 600, duration: 90, prob: 0.9 });

  const scripts = new Map<number, Map<number, ScriptDay>>();
  const script = (key: CastKey | number, day: number, s: ScriptDay) => {
    const id = typeof key === 'number' ? key : ids[key];
    if (!scripts.has(id)) scripts.set(id, new Map());
    const byDay = scripts.get(id) as Map<number, ScriptDay>;
    const prev = byDay.get(day);
    byDay.set(day, prev ? { ...prev, ...s, acts: [...(prev.acts ?? []), ...(s.acts ?? [])] } : s);
  };
  const act = (p: string | number, day: number, h: number, m: number, minutes: number, label: string, extra: Partial<Activity> = {}): Activity => {
    const start = at(day, h, m);
    return { place: typeof p === 'number' ? p : place(p).id, start, end: start + minutes, label, priority: 9, ...extra };
  };

  // --- Case: the stolen Corolla. Taken from outside Maria's house at 2:31 a.m. today.
  const stolenAt = at(TODAY, 2, 31);
  (vehicles[vehicleIds.stolen] as Vehicle).takenBy = { person: ids.joyrider, at: stolenAt };
  P('joyrider').vehicle = vehicleIds.stolen;
  script('joyrider', TODAY - 1, { replace: true, end: place('home-1-3-0').id });
  script('joyrider', TODAY, {
    replace: true,
    end: place('pier-9').id,
    acts: [
      act('home-1-3-0', TODAY, 2, 24, 7, 'unknown'),
      act('pier-9', TODAY, 2, 40, 505, 'parked', { via: [n(6, 6)] }),
      act('fuel', TODAY, 11, 16, 9, 'stop'),
      act('pier-9', TODAY, 11, 40, 740, 'parked'),
    ],
  });
  P('travis').routines.push({ place: place('dockside').id, label: 'drinks', days: [0, 1, 2, 3, 4, 5, 6], start: 1170, duration: 100, prob: 0.5 });
  // Paul Henderson's minivan drives past the camera at Fir Ave & 2nd St at about 14:06.
  script('paul', TODAY, {
    replace: true,
    acts: [act('elementary', TODAY, 14, 9, 20, 'school pickup', { via: [n(5, 1)] }), act('greenhill', TODAY, 14, 45, 25, 'groceries')],
  });

  // --- Case: the Fenwick burglary, yesterday between 1 and 3 p.m.
  const Y = TODAY - 1;
  script('june', Y, { replace: true, acts: [act('northgate-medical', Y, 12, 40, 95, 'appointment'), act('greenhill', Y, 14, 30, 60, 'groceries')] });
  const fenwick = place('home-3-1-1').id;
  script('travis', Y, { replace: true, acts: [act(fenwick, Y, 13, 52, 17, 'unknown'), act('dockside', Y, 14, 40, 90, 'drinks')] });
  for (let d = 0; d < TODAY; d++) script('travis', d, d < TODAY - 12 ? { replace: true, end: place('out-east').id } : {});
  // Owen's lunchtime loop: three laps of Northgate and Westfield.
  const lap = [n(4, 1), n(4, 0), n(0, 0), n(0, 5), n(3, 5), n(3, 2), n(4, 2), n(4, 1)];
  for (let d = 0; d <= TODAY; d++) {
    const w = weekday(d);
    if (w === 0 || w === 6) continue;
    const ride = d === Y || hash(seed, 'owen-ride', d) % 10 < 7;
    if (!ride) continue;
    const start = d === Y ? at(d, 13, 4) : at(d, 12, 30) + (hash(seed, 'owen-t', d) % 40);
    script('owen', d, { acts: [{ place: P('owen').homes[0]!.place, start, end: start + 45, label: 'bike ride', priority: 7, loop: [...lap, ...lap.slice(1), ...lap.slice(1)], mode: 'bike' }] });
  }
  // Denise walks her route through Northgate on weekdays.
  const route = [n(5, 2), n(4, 2), n(4, 0), n(2, 0), n(2, 2), n(3, 2), n(3, 1), n(4, 1), n(5, 1), n(6, 1), n(6, 2)];
  for (let d = 0; d <= TODAY; d++) {
    const w = weekday(d);
    if (w === 0 || w === 6) continue;
    script('denise', d, { acts: [{ place: place('post-office').id, start: at(d, 12, 40), end: at(d, 14, 0), label: 'mail route', priority: 7, loop: route, mode: 'walk' }] });
  }
  script('marco', Y, { acts: [act('home-3-1-2', Y, 13, 21, 12, 'delivery')] });

  // --- Case: the watch store, Tuesday at 15:42.
  const TUE = TODAY - 3;
  script('thief', TUE, { replace: true, acts: [act('watch-store', TUE, 15, 38, 9, 'shopping'), act('transit', TUE, 16, 5, 10, 'waiting')] });
  script('calvin', TUE, { acts: [act('cannery', TUE, 7, 58, 548, 'work')] });

  // --- Case: the Quik Stop robbery, today at 15:52. Kyle checked in five days ago.
  for (let d = 0; d < TODAY - 5; d++) script('kyle', d, { replace: true, end: place('out-west').id });
  script('kyle', TODAY, { replace: true, acts: [act('quik-stop', TODAY, 15, 51, 4, 'unknown', { mode: 'walk' }), act('motel', TODAY, 16, 9, 470, 'room')] });

  // --- Case: Alyssa Grant's trip. Tuesday at the clinic, a night at the motel, home Wednesday.
  const AL = TODAY - 4;
  script('alyssa', AL, { replace: true, end: place('motel').id, acts: [act('womens-health', AL, 10, 5, 185, 'appointment'), act('market', AL, 13, 40, 20, 'shopping')] });
  script('alyssa', AL + 1, { replace: true, acts: [act('motel', AL + 1, 0, 0, 560, 'motel')] });
  for (let d = 0; d <= TODAY; d++) if (d !== AL && d !== AL + 1) script('alyssa', d, { replace: true });

  // --- Case: Jenna Moore. Family law office, then a court date.
  script('jenna', TODAY - 7, { acts: [act('family-law', TODAY - 7, 17, 20, 50, 'appointment')] });
  script('jenna', TODAY - 2, { acts: [act('courthouse', TODAY - 2, 9, 0, 120, 'hearing')] });

  // --- Case: Councilmember Okafor.
  const dana = P('dana').homes[0]!.place;
  for (let d = 0; d <= TODAY; d++) {
    const w = weekday(d);
    if (w === 5 || w === 6 || (w === 2 && hash(seed, 'ruth-tue', d) % 3 === 0)) script('ruth', d, { end: dana });
  }
  script('ruth', TODAY - 8, { acts: [act('union-hall', TODAY - 8, 19, 0, 100, 'meeting')] });
  script('ruth', TODAY - 2, { acts: [act('ledger', TODAY - 2, 12, 30, 65, 'meeting')] });
  script('maya', TODAY - 2, { acts: [act('ledger', TODAY - 2, 16, 0, 40, 'meeting')] });

  return {
    people,
    vehicles,
    scripts,
    ocr: [{ vehicle: vehicleIds.minivan, camera: city.cameraAtNode[n(5, 1)] as number, day: TODAY, text: '7KDM392', conf: 71 }],
    ids,
    vehicleIds,
    immigrationList: [],
    rallyAttendees: [],
    burnerImsi: P('kyle').phone.imsi,
    stolenAt,
  };
}

/** Things that need the full population: the immigration list and last Saturday's rally. */
export function finishCast(cast: Cast, city: City, people: Person[], vehicles: Vehicle[], seed: number): void {
  const cannery = placeByKey(city, 'cannery').id;
  const legalAid = placeByKey(city, 'legal-aid').id;
  const masjid = placeByKey(city, 'masjid').id;
  const workers = people.filter((p) => !p.key && p.resident && p.job?.place === cannery && p.vehicle !== null);
  cast.immigrationList = workers.slice(0, 9).map((p) => p.id);
  cast.immigrationList.forEach((id, k) => {
    const p = people[id] as Person;
    if (k % 2 === 0) p.routines.push({ place: legalAid, label: 'appointment', days: [2, 4], start: 615, duration: 60, prob: 0.35 });
    if (k % 3 === 1) p.routines.push({ place: masjid, label: "Friday prayer (Jumu'ah)", days: [5], start: 780, duration: 60, prob: 0.9 });
  });

  // Last Saturday's rally against the camera contract, at City Hall.
  const rally = placeByKey(city, 'city-hall').id;
  const RALLY = TODAY - 6;
  const rng = new Rng(hash(seed, 'rally'));
  const organizers: CastKey[] = ['ruth', 'holloway', 'maya', 'tony', 'dana'];
  const pool = people.filter((p) => !p.key && p.resident && p.age < 75);
  const chosen = new Set<number>(organizers.map((k) => cast.ids[k]));
  while (chosen.size < 46) chosen.add((rng.pick(pool) as Person).id);
  cast.rallyAttendees = [...chosen];
  for (const id of chosen) {
    const p = people[id] as Person;
    const start = at(RALLY, 10, 50) + rng.int(0, 25);
    const byDay = cast.scripts.get(id) ?? new Map<number, ScriptDay>();
    const prev = byDay.get(RALLY);
    const rallyAct: Activity = { place: rally, start, end: start + 100 + rng.int(0, 40), label: 'rally', priority: 8 };
    byDay.set(RALLY, { ...prev, acts: [...(prev?.acts ?? []), rallyAct] });
    cast.scripts.set(id, byDay);
    // Some of them have the sticker.
    if (p.vehicle !== null && !p.key && rng.chance(0.3)) {
      const v = vehicles[p.vehicle] as Vehicle;
      if (!v.features.includes('bumper sticker: STOP THE CAMERAS')) v.features.push('bumper sticker: STOP THE CAMERAS');
    }
  }
}
