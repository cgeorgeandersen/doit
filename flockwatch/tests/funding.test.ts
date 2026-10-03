import { describe, expect, it } from 'vitest';
import { FUNDING, fundingRows, kindLabel, operatorKind, type FundingRow } from '../src/lib/funding';
import type { LngLat } from '../src/lib/geo';

const OAKLAND: LngLat = [-122.27, 37.8];
const DALLAS_TX: LngLat = [-96.8, 32.78];
const DALLAS_GA: LngLat = [-84.84, 33.92];

// The card's rows as text: names in **bold**, kinds in [brackets].
const text = (rows: FundingRow[]) =>
  rows
    .map((r) => `${r.label}: ${r.name ? `**${r.name}**` : 'unknown'}${r.kind ? ` [${r.kind}]` : ''}${r.how ? `, ${r.how}` : ''}${r.source ? ' (source)' : ''}`)
    .join(' / ');

const label = (name: string) => {
  const kind = operatorKind(name);
  return kind && kindLabel(kind, name);
};

describe('operatorKind', () => {
  it('sorts the operators volunteers record most often', () => {
    const cases: Array<[string, string]> = [
      ["Lowe's", 'private'],
      ['The Home Depot', 'private'],
      ['Simon Property Group', 'private'],
      ["Interlocken Owners' Association, Inc.", 'private'],
      ['San Francisco Police Department', 'city'],
      ['City of Yakima', 'city'],
      ['Shelby Township Police Department', 'township'],
      ["Oakland County Sheriff's Office", 'county'],
      ['Henrico County Police Division', 'county'],
      ['Pasco Sheriff’s Office', 'county'],
      ['Las Vegas Metropolitan Police Department', 'city-county'],
      ['California Highway Patrol (CHP)', 'state'],
      ['Michigan State Police', 'state'],
      ['Texas Department of Public Safety', 'state'],
      ['Customs and Border Protection', 'federal'],
      ['Cherokee Indian Police Department', 'tribal'],
    ];
    for (const [name, want] of cases) expect(label(name), name).toBe(want);
  });

  it('isn’t fooled by city agencies whose names sound like something else', () => {
    const cities = [
      'Sunnyvale Department of Public Safety',
      'Sunnyvale DPS',
      'University Heights PD',
      'State College Police Department',
      'Falls Church Police Department',
      'Country Club Hills Police Department',
      'Brookfield Police Department',
      'Federal Way Police',
    ];
    for (const name of cities) expect(operatorKind(name), name).toBe('city');
    expect(operatorKind('Navy Federal Credit Union')).toBe('private');
  });

  it('leaves the kind off when the name doesn’t say', () => {
    const unclear = [
      'University of Arizona Police Department',
      'Frisco ISD',
      'JCPD',
      'Burbank',
      'Northern Regional Police Department of Allegheny County',
      'Stonewall Ranch Municipal Utility District',
    ];
    for (const name of unclear) expect(operatorKind(name), name).toBeNull();
  });
});

describe('fundingRows', () => {
  it('says unknown when no one recorded who runs the camera', () => {
    expect(text(fundingRows('', OAKLAND, true))).toBe('Funded and operated by: unknown');
    expect(text(fundingRows('Unknown', OAKLAND, true))).toBe('Funded and operated by: unknown');
  });

  it('counts a business’s own cameras as privately funded', () => {
    expect(text(fundingRows("Lowe's", OAKLAND, true))).toBe("Funded and operated by: **Lowe's** [private]");
  });

  it('keeps funding unknown for an agency with no record, whatever its kind', () => {
    expect(text(fundingRows("Volusia County Sheriff's Office", [-81.2, 29.0], true))).toBe(
      "Funded by: unknown / Operated by: **Volusia County Sheriff's Office** [county]",
    );
  });

  it('names an agency that paid for its own cameras, with the source', () => {
    expect(text(fundingRows('California Highway Patrol (CHP)', OAKLAND, true))).toBe(
      'Funded and operated by: **California Highway Patrol (CHP)** [state] (source)',
    );
  });

  it('applies funding records only to the Flock cameras they describe', () => {
    expect(text(fundingRows('California Highway Patrol (CHP)', OAKLAND, false))).toBe(
      'Funded by: unknown / Operated by: **California Highway Patrol (CHP)** [state]',
    );
    // A business pays for its own cameras, whoever made them.
    expect(text(fundingRows("Lowe's", OAKLAND, false))).toBe("Funded and operated by: **Lowe's** [private]");
  });

  it('names a different funder only near the place its record covers', () => {
    expect(text(fundingRows('Dallas Police Department', DALLAS_TX, true))).toBe(
      'Funded by: **Texas state grant**, at least in part (source) / Operated by: **Dallas Police Department** [city]',
    );
    // Dallas, Georgia has a police department of its own.
    expect(text(fundingRows('Dallas Police Department', DALLAS_GA, true))).toBe(
      'Funded by: unknown / Operated by: **Dallas Police Department** [city]',
    );
  });
});

describe('FUNDING', () => {
  it('cites a dated public source for every record', () => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    for (const f of FUNDING) {
      expect(f.source, String(f.operators)).toMatch(/^https:\/\/\S+$/);
      expect(f.asOf, String(f.operators)).toMatch(/^20\d\d-(0[1-9]|1[0-2])$/);
      expect(f.asOf <= thisMonth, String(f.operators)).toBe(true);
    }
  });
});
