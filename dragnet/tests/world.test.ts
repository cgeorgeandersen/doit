import { beforeAll, describe, expect, it } from 'vitest';
import { nodeIndex, placeByKey, route } from '../src/core/city';
import { homeOn } from '../src/core/people';
import { at, dayOf, fmtDate, MIN_PER_DAY, TODAY, weekday } from '../src/core/time';
import { buildWorld, misread, type World } from '../src/core/world';

let w: World;
beforeAll(() => {
  w = buildWorld();
});

describe('the calendar', () => {
  it('puts the shift on Friday, October 23, 2026', () => {
    expect(fmtDate(TODAY)).toBe('Fri Oct 23');
    expect(weekday(TODAY)).toBe(5);
    expect(fmtDate(0)).toBe('Wed Sep 23');
  });
});

describe('the city', () => {
  it('has every place the cases need', () => {
    for (const key of ['shelter', 'womens-health', 'legal-aid', 'st-brendan', 'motel', 'pier-9', 'watch-store', 'city-hall', 'home-3-1-1']) {
      expect(() => placeByKey(w.city, key)).not.toThrow();
    }
  });

  it('crosses the river only on bridges', () => {
    const path = route(w.city, nodeIndex(0, 5), nodeIndex(0, 8), 1);
    const crossings = path.slice(1).filter((n, k) => Math.floor(n / 13) === 7 && Math.floor((path[k] as number) / 13) === 6);
    expect(crossings).toHaveLength(1);
    expect([2, 6, 10]).toContain((crossings[0] as number) % 13);
  });

  it('gives every place a unique address', () => {
    const addresses = w.city.places.filter((p) => p.kind !== 'outside').map((p) => p.address);
    expect(new Set(addresses).size).toBe(addresses.length);
  });
});

describe('the people', () => {
  it('is deterministic for a seed', () => {
    const again = buildWorld();
    expect(again.people.length).toBe(w.people.length);
    expect(again.reads.length).toBe(w.reads.length);
    expect(again.people[200]?.first).toBe(w.people[200]?.first);
  });

  it('gives every plate to one vehicle', () => {
    expect(new Set(w.vehicles.map((v) => v.plate)).size).toBe(w.vehicles.length);
  });

  it('keeps every day continuous from midnight to midnight', () => {
    for (const id of [0, 5, 50, 300, w.people.length - 1]) {
      for (const day of [3, 17, TODAY]) {
        const plan = w.plan(id, day);
        expect(plan.stops[0]?.start).toBe(day * MIN_PER_DAY);
        expect(plan.stops[plan.stops.length - 1]?.end).toBe((day + 1) * MIN_PER_DAY);
        expect(plan.trips.length).toBe(plan.stops.length - 1);
        plan.trips.forEach((trip, k) => {
          expect(trip.depart).toBeCloseTo(plan.stops[k]!.end, 6);
          expect(trip.arrive).toBeCloseTo(plan.stops[k + 1]!.start, 6);
          expect(trip.arrive).toBeGreaterThanOrEqual(trip.depart);
        });
      }
    }
  });

  it('wakes up where they fell asleep', () => {
    for (const id of [w.cast.ids.ruth, w.cast.ids.jenna, 77, 140]) {
      for (let day = 1; day <= TODAY; day++) {
        const yesterday = w.plan(id, day - 1);
        const today = w.plan(id, day);
        expect(today.stops[0]?.place).toBe(yesterday.stops[yesterday.stops.length - 1]?.place);
      }
    }
  });
});

describe('the cast', () => {
  it('has the stolen Corolla cross the Ginkgo bridge after 2:31 a.m.', () => {
    const v = w.cast.vehicleIds.stolen;
    const tonight = w.reads.filter((r) => r.vehicle === v && r.t > at(TODAY, 2, 31) && r.t < at(TODAY, 3, 0));
    expect(tonight.map((r) => w.city.cameras[r.camera]?.name)).toContain('Ginkgo Ave & River Rd');
    expect(w.positionAt(w.people.findIndex((p) => p.key === 'joyrider'), at(TODAY, 14, 0)).place).toBe(placeByKey(w.city, 'pier-9').id);
  });

  it('misreads the Hendersons\' minivan as the stolen plate exactly once', () => {
    const hits = w.reads.filter((r) => r.text === '7KDM392' && r.vehicle === w.cast.vehicleIds.minivan);
    expect(hits).toHaveLength(1);
    expect(w.city.cameras[hits[0]!.camera]?.name).toBe('Fir Ave & 2nd St');
    expect(dayOf(hits[0]!.t)).toBe(TODAY);
  });

  it('puts Travis Lyle inside the Fenwick house during the burglary', () => {
    const house = placeByKey(w.city, 'home-3-1-1').id;
    expect(w.positionAt(w.cast.ids.travis, at(TODAY - 1, 14, 0)).place).toBe(house);
    expect(w.positionAt(w.cast.ids.june, at(TODAY - 1, 14, 0)).place).not.toBe(house);
  });

  it('moved Jenna Moore into the shelter nine days ago', () => {
    const jenna = w.people[w.cast.ids.jenna]!;
    expect(homeOn(jenna, TODAY)).toBe(placeByKey(w.city, 'shelter').id);
    expect(homeOn(jenna, TODAY - 10)).toBe(homeOn(w.people[w.cast.ids.kessler]!, TODAY));
    expect(w.positionAt(jenna.id, at(TODAY, 3, 0)).place).toBe(placeByKey(w.city, 'shelter').id);
  });

  it('has Alyssa Grant at the clinic on Tuesday and gone by today', () => {
    expect(w.positionAt(w.cast.ids.alyssa, at(TODAY - 4, 11, 0)).place).toBe(placeByKey(w.city, 'womens-health').id);
    expect(w.positionAt(w.cast.ids.alyssa, at(TODAY, 15, 0)).place).toBe(placeByKey(w.city, 'out-west').id);
  });

  it('has Ruth Okafor sleep at Dana Whitlock\'s on Friday nights', () => {
    const dana = homeOn(w.people[w.cast.ids.dana]!, TODAY);
    expect(w.positionAt(w.cast.ids.ruth, at(TODAY - 6, 3, 0)).place).toBe(dana);
  });

  it('sends 46 people to last Saturday\'s rally', () => {
    expect(w.cast.rallyAttendees).toHaveLength(46);
    const hall = placeByKey(w.city, 'city-hall').id;
    const there = w.cast.rallyAttendees.filter((id) => w.positionAt(id, at(TODAY - 6, 11, 50)).place === hall);
    expect(there.length).toBeGreaterThan(36);
  });
});

describe('plate misreads', () => {
  it('swaps one confusable character', () => {
    const read = misread('7KDM392', 12345);
    expect(read).not.toBe('7KDM392');
    expect(read).toHaveLength(7);
    expect([...read].filter((c, k) => c !== '7KDM392'[k])).toHaveLength(1);
  });
});
