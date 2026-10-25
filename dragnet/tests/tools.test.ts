import { beforeAll, describe, expect, it } from 'vitest';
import { ALERT_AT, isAlert, precision, soundsForDay } from '../src/core/acoustic';
import { convoy, frequentLocations, normalizePlate, platePattern, searchFingerprint, searchPlate } from '../src/core/alpr';
import { placeByKey } from '../src/core/city';
import { buildDossier } from '../src/core/dossier';
import { celebrity, probeOf, search } from '../src/core/face';
import { DEFAULT_FORECAST, initForecast, stepForecast } from '../src/core/forecast';
import { bedDown, geofence, pings } from '../src/core/location';
import { homeOn } from '../src/core/people';
import { buildPosts, DEFAULT_KEYWORDS, flagPosts, scorePost } from '../src/core/social';
import { capture } from '../src/core/stingray';
import { at, MIN_PER_DAY, TODAY } from '../src/core/time';
import { buildWorld, type World } from '../src/core/world';

let w: World;
beforeAll(() => {
  w = buildWorld();
});

const month = () => ({ from: (TODAY - 30) * MIN_PER_DAY, to: at(TODAY, 14, 30) });

describe('plate search', () => {
  it('understands wildcards and ignores spaces', () => {
    expect(platePattern('7K*392').test('7KDM392')).toBe(true);
    expect(platePattern('7KD?392').test('7KDM392')).toBe(true);
    expect(platePattern('7KD?392').test('7KDMM392')).toBe(false);
    expect(normalizePlate('lkm 4417')).toBe('LKM4417');
  });

  it('returns the misread minivan along with the stolen car', () => {
    const hits = searchPlate(w, '7KDM392', month());
    const vehicles = new Set(hits.flatMap((h) => h.reads.map((r) => r.vehicle)));
    expect(vehicles.has(w.cast.vehicleIds.stolen)).toBe(true);
    expect(vehicles.has(w.cast.vehicleIds.minivan)).toBe(true);
  });

  it("doesn't return reads from the future", () => {
    const hits = searchPlate(w, '7KDM392', { from: 0, to: at(TODAY, 14, 0) });
    expect(hits.flatMap((h) => h.reads).some((r) => r.vehicle === w.cast.vehicleIds.minivan)).toBe(false);
  });

  it('finds where Jenna Moore\'s car sleeps from the last read of each day', () => {
    const reads = searchPlate(w, '8RTN227', { from: (TODAY - 8) * MIN_PER_DAY, to: at(TODAY, 17, 30) }).flatMap((h) => h.reads);
    const top = [...frequentLocations(w, reads)].sort((a, b) => b.lastOfDay - a.lastOfDay)[0];
    const shelter = placeByKey(w.city, 'shelter');
    expect(top).toBeDefined();
    expect(Math.hypot(top!.camera.x - shelter.x, top!.camera.y - shelter.y)).toBeLessThan(330);
  });

  it('can find every car with a STOP THE CAMERAS sticker, no plate needed', () => {
    const found = searchFingerprint(w, { feature: 'STOP THE CAMERAS' }, month());
    expect(found.has(w.cast.vehicleIds.ruth)).toBe(true);
    expect(found.size).toBeGreaterThan(4);
  });

  it('runs convoy analysis', () => {
    const v = w.cast.vehicleIds.ruth;
    const reads = searchPlate(w, '6RTH518', month()).flatMap((h) => h.reads);
    const companions = convoy(w, reads, v);
    for (const c of companions) expect(c.vehicle).not.toBe(v);
  });
});

describe('phone location', () => {
  it('puts the burglar, the cyclist and the neighbors in the geofence', () => {
    const house = placeByKey(w.city, 'home-3-1-1');
    const devices = geofence(w, { x0: house.x - 60, y0: house.y - 50, x1: house.x + 60, y1: house.y + 50 }, at(TODAY - 1, 13), at(TODAY - 1, 15));
    const ids = devices.map((d) => d.person);
    expect(ids).toContain(w.cast.ids.travis);
    expect(ids).toContain(w.cast.ids.owen);
    expect(devices.length).toBeGreaterThan(4);
    const owen = devices.find((d) => d.person === w.cast.ids.owen)!;
    expect(owen.visits).toBeGreaterThanOrEqual(3);
  });

  it('records a dense trail while the cyclist logs a ride', () => {
    const ride = pings(w, w.cast.ids.owen, at(TODAY - 1, 13, 5), at(TODAY - 1, 13, 25));
    expect(ride.length).toBeGreaterThan(50);
  });

  it('turns an "anonymous" device into a home address', () => {
    const bed = bedDown(w, w.cast.ids.travis, at(TODAY, 15));
    expect(bed?.place.key).toBe('motel');
  });

  it('gives no data for phones without location-selling apps', () => {
    expect(pings(w, w.cast.ids.kyle, at(TODAY, 0), at(TODAY, 15))).toHaveLength(0);
  });
});

describe('cell-site simulator', () => {
  it('catches the target and everyone around him', () => {
    const motel = placeByKey(w.city, 'motel');
    const caught = capture(w, motel.x, motel.y, 300, at(TODAY, 16, 25));
    expect(caught.map((c) => c.imsi)).toContain(w.cast.burnerImsi);
    expect(caught.length).toBeGreaterThan(10);
  });
});

describe('face recognition', () => {
  it('ranks the lookalike first when the thief is not in the gallery', () => {
    const probe = probeOf(w.people[w.cast.ids.thief]!.face, 0.34, 1);
    const results = search(w, probe, true, 5);
    expect(results[0]?.person).toBe(w.cast.ids.calvin);
    expect(results.some((r) => r.person === w.cast.ids.thief)).toBe(false);
    expect(results[0]!.score).toBeGreaterThan(60);
  });

  it('matches a clean photo of someone in the gallery with high confidence', () => {
    const results = search(w, probeOf(w.people[w.cast.ids.maria]!.face, 0.95, 3), true, 3);
    expect(results[0]?.person).toBe(w.cast.ids.maria);
    expect(results[0]!.score).toBeGreaterThan(90);
  });

  it('always returns a first place, even for a celebrity', () => {
    const results = search(w, celebrity(w.people[w.cast.ids.thief]!.face, 9), true, 5);
    expect(results).toHaveLength(5);
  });

  it('only searches booking photos when DMV photos are switched off', () => {
    const results = search(w, probeOf(w.people[w.cast.ids.maria]!.face, 0.95, 3), false, 20);
    expect(results.every((r) => r.source === 'Booking')).toBe(true);
  });
});

describe('gunshot detection', () => {
  it('raises alerts that are mostly not gunfire', () => {
    const alerts = soundsForDay(w, TODAY, true).filter(isAlert);
    expect(alerts.length).toBeGreaterThan(3);
    expect(alerts.filter((a) => a.kind === 'gunfire').length).toBeLessThan(alerts.length / 2);
    for (const a of alerts) expect(a.score).toBeGreaterThanOrEqual(ALERT_AT);
  });

  it('applies Bayes\' rule', () => {
    expect(precision(0.05, 0.9, 0.9)).toBeCloseTo(0.045 / (0.045 + 0.095), 6);
    expect(precision(0.5, 1, 1)).toBe(1);
  });
});

describe('social media monitoring', () => {
  it('flags slang and organizing as threats', () => {
    expect(scorePost('This burger is the bomb', DEFAULT_KEYWORDS).score).toBeGreaterThanOrEqual(2);
    const flags = flagPosts(buildPosts(w), DEFAULT_KEYWORDS);
    const kinds = new Set(flags.map((f) => f.post.kind));
    expect(kinds.has('slang')).toBe(true);
    expect(kinds.has('organizing')).toBe(true);
    expect(flags.filter((f) => f.post.kind === 'threat').length).toBeLessThan(3);
  });
});

describe('predictive policing', () => {
  it('keeps sending patrols to Eastside though crime is equal everywhere', () => {
    const s = initForecast(DEFAULT_FORECAST);
    for (let k = 0; k < 60; k++) stepForecast(s);
    const last = s.history.slice(-20);
    const patrols = last.reduce((a, h) => a + h.eastPatrols, 0) / last.length;
    expect(patrols).toBeGreaterThan(0.7);
  });

  it('settles near the truth when it learns only from reported crime', () => {
    const s = initForecast({ ...DEFAULT_FORECAST, reportedOnly: true });
    for (let k = 0; k < 90; k++) stepForecast(s);
    const last = s.history.slice(-30);
    const patrols = last.reduce((a, h) => a + h.eastPatrols, 0) / last.length;
    expect(patrols).toBeLessThan(0.5);
  });
});

describe('dossier', () => {
  it("draws the sensitive inferences from Councilmember Okafor's month", () => {
    const d = buildDossier(w, w.cast.ids.ruth, at(TODAY, 21, 30), buildPosts(w));
    const tags = new Set(d.inferences.map((i) => i.tag));
    for (const tag of ['addiction', 'mental-health', 'immigration', 'overnight', 'protest', 'press'] as const) expect(tags).toContain(tag);
    expect(d.associates.some((a) => a.person.id === w.cast.ids.dana)).toBe(true);
    expect(d.threat).not.toBe('GREEN');
  });

  it('exposes the shelter Jenna Moore is staying in', () => {
    const d = buildDossier(w, w.cast.ids.jenna, at(TODAY, 17, 30), []);
    expect(d.home.id).toBe(homeOn(w.people[w.cast.ids.jenna]!, TODAY));
    expect(d.inferences.some((i) => i.tag === 'shelter')).toBe(true);
  });
});
