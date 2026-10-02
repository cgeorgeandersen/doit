import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  districtKey,
  governingBody,
  headsQuery,
  localLabel,
  looksGovernmental,
  matchCongress,
  matchLegislators,
  officeTitle,
  parseCensus,
  parseHeads,
  partyAbbr,
  type CensusResponse,
  type Jurisdiction,
  type StateFile,
} from '../src/lib/officials';

/** Real Census Geocoder answers (trimmed to the layers we read), saved September 2026. */
const census = (name: string) =>
  parseCensus(JSON.parse(readFileSync(resolve(import.meta.dirname, `fixtures/census-${name}.json`), 'utf8')) as CensusResponse)!;

describe('parseCensus', () => {
  it('reads a city, its county and every district', () => {
    expect(census('atlanta')).toEqual({
      state: { name: 'Georgia', abbr: 'GA' },
      local: { name: 'Atlanta city', label: 'City of Atlanta', kind: 'city', gnis: '02403126' },
      county: { name: 'Fulton County', gnis: '01694833', governs: true },
      upper: { name: 'State Senate District 36', basename: '36' },
      lower: { name: 'State House District 58', basename: '58' },
      congressional: 5,
    });
  });

  it('uses a township when there is no city, and skips statistical areas', () => {
    const j = census('cranberry-pa');
    expect(j.local).toEqual({ name: 'Cranberry township', label: 'Cranberry Township', kind: 'township', gnis: '01216052' });
    expect(j.county?.name).toBe('Butler County');
  });

  it('picks up a newly incorporated city', () => {
    expect(census('mableton-ga').local?.label).toBe('City of Mableton');
  });

  it('notes counties without a government of their own', () => {
    const boston = census('boston');
    expect(boston.local?.label).toBe('City of Boston');
    expect(boston.county).toEqual({ name: 'Suffolk County', gnis: '00606939', governs: false });
    expect(boston.upper?.basename).toBe('Third Suffolk');
    expect(boston.lower?.basename).toBe('3rd Suffolk');
  });

  it('treats DC as its own local government with a delegate seat', () => {
    const dc = census('dc');
    expect(dc.state.abbr).toBe('DC');
    expect(dc.local?.label).toBe('District of Columbia');
    expect(dc.county).toBeNull();
    expect(dc.upper?.name).toBe('Ward 2');
    expect(dc.congressional).toBe(0);
  });

  it('returns null for a point outside the United States', () => {
    expect(parseCensus({ result: { geographies: {} } })).toBeNull();
    expect(parseCensus({})).toBeNull();
  });
});

describe('district names', () => {
  it('matches the Census and Open States spellings', () => {
    expect(districtKey('Third Suffolk District')).toBe(districtKey('Third Suffolk'));
    expect(districtKey('Third Suffolk')).toBe(districtKey('3rd Suffolk'));
    expect(districtKey('First Bristol & Plymouth District')).toBe(districtKey('First Bristol and Plymouth'));
    expect(districtKey('State House District 058')).toBe('58');
    expect(districtKey('State Senate District 36')).toBe('36');
    expect(districtKey('State House District Hillsborough 23')).toBe(districtKey('Hillsborough 23'));
    expect(districtKey('Addison-1')).toBe(districtKey('Addison 1'));
    expect(districtKey('11A')).toBe('11a');
    expect(districtKey('Legislative District 12')).toBe('12');
  });

  it('labels local governments the way they sign their letters', () => {
    expect(localLabel('Atlanta city', 'Atlanta').label).toBe('City of Atlanta');
    expect(localLabel('Oak Park village', 'Oak Park').label).toBe('Village of Oak Park');
    expect(localLabel('State College borough', 'State College').label).toBe('Borough of State College');
    expect(localLabel('Canton charter township', 'Canton').label).toBe('Canton Charter Township');
    expect(localLabel('Nashville-Davidson metropolitan government (balance)', 'Nashville-Davidson').label).toBe(
      'Nashville-Davidson metropolitan government (balance)',
    );
  });

  it('names the body that approves camera contracts', () => {
    expect(governingBody('city')).toBe('City council');
    expect(governingBody('township')).toBe('Township board');
    expect(governingBody('county')).toBe('County board');
    expect(governingBody('metropolitan government (balance)')).toBe('Local council');
  });

  it('abbreviates parties', () => {
    expect(partyAbbr('Democratic')).toBe('D');
    expect(partyAbbr('Democrat')).toBe('D');
    expect(partyAbbr('Republican')).toBe('R');
    expect(partyAbbr('Democratic-Farmer-Labor')).toBe('DFL');
    expect(partyAbbr('Independent')).toBe('I');
    expect(partyAbbr('Nonpartisan')).toBe('');
  });
});

describe('matching officials', () => {
  const ga: StateFile = {
    state: 'ga',
    legislators: [
      { name: 'Nan Orrock', party: 'Democratic', chamber: 'upper', district: '36', email: 'nan.orrock@senate.ga.gov' },
      { name: 'Ginny Ehrhart', party: 'Republican', chamber: 'lower', district: '36' },
      { name: 'Park Cannon', party: 'Democratic', chamber: 'lower', district: '58', url: 'https://www.legis.ga.gov/members/house/4880' },
    ],
    congress: [
      { name: 'Nikema Williams', party: 'Democrat', chamber: 'house', district: 5, phone: '202-225-3801' },
      { name: 'Lucy McBath', party: 'Democrat', chamber: 'house', district: 6 },
      { name: 'Jon Ossoff', party: 'Democrat', chamber: 'senate', contact: 'https://www.ossoff.senate.gov/contact' },
      { name: 'Raphael G. Warnock', party: 'Democrat', chamber: 'senate' },
    ],
  };

  it('finds the state senator and representative for the spot, not other chambers’ namesakes', () => {
    const people = matchLegislators(census('atlanta'), ga);
    expect(people.map((p) => [p.role, p.name, p.party, p.district])).toEqual([
      ['State senator', 'Nan Orrock', 'D', '36'],
      ['State representative', 'Park Cannon', 'D', '58'],
    ]);
    expect(people[0]!.email).toBe('nan.orrock@senate.ga.gov');
  });

  it('finds the U.S. representative for the district and both senators', () => {
    const people = matchCongress(census('atlanta'), ga);
    expect(people.map((p) => [p.role, p.name, p.district ?? ''])).toEqual([
      ['U.S. representative', 'Nikema Williams', 'GA-5'],
      ['U.S. senator', 'Jon Ossoff', ''],
      ['U.S. senator', 'Raphael G. Warnock', ''],
    ]);
    expect(people[1]!.url).toBe('https://www.ossoff.senate.gov/contact');
  });

  it('returns every member of a multi-member district', () => {
    const nh: StateFile = {
      state: 'nh',
      legislators: [
        { name: 'Jean Jeudy', party: 'Democratic', chamber: 'lower', district: 'Hillsborough 23' },
        { name: 'Mary Georges', party: 'Democratic', chamber: 'lower', district: 'Hillsborough 23' },
        { name: 'Pat Long', party: 'Democratic', chamber: 'upper', district: '20' },
        { name: 'Someone Else', party: 'Republican', chamber: 'lower', district: 'Hillsborough 3' },
      ],
      congress: [],
    };
    expect(matchLegislators(census('manchester-nh'), nh).map((p) => p.name)).toEqual(['Pat Long', 'Jean Jeudy', 'Mary Georges']);
  });

  it('matches Massachusetts districts named in words', () => {
    const ma: StateFile = {
      state: 'ma',
      legislators: [
        { name: 'Senator Third', party: 'Democratic', chamber: 'upper', district: 'Third Suffolk' },
        { name: 'Aaron Michlewitz', party: 'Democratic', chamber: 'lower', district: '3rd Suffolk' },
        { name: 'Adrian Madaro', party: 'Democratic', chamber: 'lower', district: '1st Suffolk' },
      ],
      congress: [],
    };
    expect(matchLegislators(census('boston'), ma).map((p) => p.name)).toEqual(['Senator Third', 'Aaron Michlewitz']);
  });

  it('lists the ward councilmember first in DC, then the at-large members and chair', () => {
    const dc: StateFile = {
      state: 'dc',
      legislators: [
        { name: 'Anita Bonds', party: 'Democratic', chamber: 'legislature', district: 'At-Large' },
        { name: 'Brooke Pinto', party: 'Democratic', chamber: 'legislature', district: 'Ward 2' },
        { name: 'Phil Mendelson', party: 'Democratic', chamber: 'legislature', district: 'Chairman' },
        { name: 'Ward Three', party: 'Democratic', chamber: 'legislature', district: 'Ward 3' },
      ],
      congress: [{ name: 'Eleanor Holmes Norton', party: 'Democrat', chamber: 'house', district: 0 }],
    };
    const j = census('dc');
    expect(matchLegislators(j, dc).map((p) => [p.role, p.name])).toEqual([
      ['Ward councilmember', 'Brooke Pinto'],
      ['At-large councilmember', 'Anita Bonds'],
      ['Council chair', 'Phil Mendelson'],
    ]);
    expect(matchCongress(j, dc).map((p) => [p.role, p.name, p.district])).toEqual([
      ['Delegate to Congress', 'Eleanor Holmes Norton', 'DC at large'],
    ]);
  });

  it('uses each state’s title for its lower chamber', () => {
    const j: Jurisdiction = { ...census('atlanta'), state: { name: 'Virginia', abbr: 'VA' } };
    const va: StateFile = { state: 'va', legislators: [{ name: 'A Delegate', party: 'Republican', chamber: 'lower', district: '58' }], congress: [] };
    expect(matchLegislators(j, va)[0]!.role).toBe('Delegate');
  });
});

describe('Wikidata heads of government', () => {
  it('builds a query with clean GNIS codes', () => {
    const q = headsQuery(['02403126', '01694833"; DROP']);
    expect(q).toContain('VALUES ?gnis { "2403126" "1694833" }');
  });

  it('takes the current office-holder over a stale city record, and a government website', () => {
    // Shaped like Wikidata's answer for Oakland in October 2026: the city's own field still
    // names the recalled mayor; office-holder records name her successor, plus an old record with no end date.
    const heads = parseHeads({
      results: {
        bindings: [
          { gnis: { value: '2411292' }, source: { value: 'p6' }, headLabel: { value: 'Sheng Thao' }, rank: { value: 'http://wikiba.se/ontology#NormalRank' }, officeLabel: { value: 'mayor of Oakland' }, site: { value: 'https://visitoakland.com/' } },
          { gnis: { value: '2411292' }, source: { value: 'office' }, headLabel: { value: 'Libby Schaaf' }, start: { value: '2015-01-05T00:00:00Z' }, site: { value: 'https://www.oaklandca.gov/' } },
          { gnis: { value: '2411292' }, source: { value: 'office' }, head: { value: 'http://www.wikidata.org/entity/Q434952' }, headLabel: { value: 'Barbara Lee' }, start: { value: '2025-05-20T00:00:00Z' } },
          { gnis: { value: '1694833' }, headLabel: { value: 'Q12345' } },
        ],
      },
    });
    expect(heads.get('2411292')).toEqual({
      gnis: '2411292',
      head: 'Barbara Lee',
      headUrl: 'https://www.wikidata.org/wiki/Q434952',
      office: 'mayor of Oakland',
      website: 'https://www.oaklandca.gov/',
    });
    expect(heads.get('1694833')).toEqual({ gnis: '1694833' });
  });

  it('ignores undated office records and uses the city record instead', () => {
    // Shaped like Tempe, Arizona: an old mayor listed as office-holder with no dates; the city names the current one.
    const heads = parseHeads({
      results: {
        bindings: [{ gnis: { value: '2412045' }, source: { value: 'p6' }, headLabel: { value: 'Corey Woods' }, rank: { value: 'http://wikiba.se/ontology#NormalRank' }, officeLabel: { value: 'Mayor of Tempe, Arizona' } }],
      },
    });
    expect(heads.get('2412045')?.head).toBe('Corey Woods');
    expect(headsQuery(['02412045'])).toContain('ps:P39 ?held ; pq:P580 ?start');
  });

  it('ignores office records whose start date is an unknown value', () => {
    const heads = parseHeads({
      results: {
        bindings: [
          { gnis: { value: '2395220' }, source: { value: 'office' }, headLabel: { value: 'Zohran Mamdani' }, start: { value: '2026-01-01T00:00:00Z' } },
          { gnis: { value: '2395220' }, source: { value: 'office' }, headLabel: { value: 'Pauline' }, start: { value: 'http://www.wikidata.org/.well-known/genid/43642c7d0aea70355275d09c80c92a80' } },
        ],
      },
    });
    expect(heads.get('2395220')?.head).toBe('Zohran Mamdani');
    expect(headsQuery(['1'])).toContain('FILTER EXISTS { ?head wdt:P31 wd:Q5 }');
  });

  it('lets the city record win when it names someone who started later', () => {
    const heads = parseHeads({
      results: {
        bindings: [
          { gnis: { value: '9' }, source: { value: 'office' }, headLabel: { value: 'Predecessor' }, start: { value: '2016-01-01T00:00:00Z' } },
          { gnis: { value: '9' }, source: { value: 'p6' }, headLabel: { value: 'Successor' }, start: { value: '2024-01-01T00:00:00Z' } },
        ],
      },
    });
    expect(heads.get('9')?.head).toBe('Successor');
  });

  it('falls back to the city record, preferring preferred rank and the latest start', () => {
    const heads = parseHeads({
      results: {
        bindings: [
          { gnis: { value: '1' }, source: { value: 'p6' }, headLabel: { value: 'Old' }, rank: { value: 'http://wikiba.se/ontology#NormalRank' }, start: { value: '2010-01-01T00:00:00Z' } },
          { gnis: { value: '1' }, source: { value: 'p6' }, headLabel: { value: 'New' }, rank: { value: 'http://wikiba.se/ontology#NormalRank' }, start: { value: '2022-01-03T00:00:00Z' } },
          { gnis: { value: '2' }, source: { value: 'p6' }, headLabel: { value: 'Normal' }, rank: { value: 'http://wikiba.se/ontology#NormalRank' } },
          { gnis: { value: '2' }, source: { value: 'p6' }, headLabel: { value: 'Preferred' }, rank: { value: 'http://wikiba.se/ontology#PreferredRank' } },
        ],
      },
    });
    expect(heads.get('1')?.head).toBe('New');
    expect(heads.get('2')?.head).toBe('Preferred');
  });

  it('only trusts links that look like a government’s own site', () => {
    expect(looksGovernmental('https://www.atlantaga.gov/')).toBe(true);
    expect(looksGovernmental('https://www.cityofmarietta.com/')).toBe(true);
    expect(looksGovernmental('https://www.cranberrytownship.org/')).toBe(true);
    expect(looksGovernmental('https://discoveratlanta.com/')).toBe(false);
    expect(looksGovernmental('https://www.visitkansascity.com/')).toBe(false);
    expect(looksGovernmental('https://downtownatlanta.com/')).toBe(false);
    expect(looksGovernmental('not a url')).toBe(false);
  });

  it('turns an office into a short title', () => {
    expect(officeTitle('mayor of Atlanta', 'city')).toBe('Mayor');
    expect(officeTitle('chair of the Cobb County Board of Commissioners', 'county')).toBe('Chair of the Cobb County Board of Commissioners');
    expect(officeTitle(undefined, 'city')).toBe('Mayor');
    expect(officeTitle(undefined, 'township')).toBe('Leader');
  });
});
