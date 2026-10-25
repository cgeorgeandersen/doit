import { describe as group, expect, it } from 'vitest';
import { band, crowdScore, describe, justiceScore, rule, severity, STEPS, type Sentence } from '../src/core/sentence';
import { CASES } from '../src/core/cases';
import type { Case } from '../src/core/types';

const none = {};
const byId = (id: string) => CASES.find((c) => c.id === id)!;

group('severity', () => {
  it('puts every kind of sentence on one 0 to 10 scale, in order', () => {
    const ladder: Sentence[] = [
      { kind: 'free' },
      { kind: 'fine', amount: 100 },
      { kind: 'fine', amount: 10_000 },
      { kind: 'probation', months: 60 },
      { kind: 'prison', years: 1 },
      { kind: 'prison', years: 10 },
      { kind: 'prison', years: 99 },
      { kind: 'prison', years: 'life' },
      { kind: 'death' },
    ];
    const values = ladder.map((s) => severity(s, none));
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(10);
  });

  it('grows with the log of the amount', () => {
    expect(severity({ kind: 'fine', amount: 100 }, none)).toBeCloseTo(1);
    expect(severity({ kind: 'fine', amount: 10_000 }, none)).toBeCloseTo(2);
    expect(severity({ kind: 'prison', years: 1 }, none)).toBeCloseTo(5);
    expect(severity({ kind: 'prison', years: 10 }, none)).toBeCloseTo(7);
  });

  it('every slider stop stays on the scale', () => {
    for (const amount of STEPS.fine) expect(severity({ kind: 'fine', amount }, none)).toBeLessThanOrEqual(3);
    for (const hours of STEPS.service) expect(severity({ kind: 'service', hours }, none)).toBeLessThanOrEqual(2.5);
    for (const months of STEPS.probation) expect(severity({ kind: 'probation', months }, none)).toBeLessThanOrEqual(4);
    for (const years of STEPS.prison) expect(severity({ kind: 'prison', years }, none)).toBeLessThanOrEqual(9.3);
  });

  it("uses the case's own number for its creative sentence", () => {
    expect(severity({ kind: 'special' }, byId('prom-goose'))).toBe(1);
  });
});

group('describe', () => {
  it('reads like a sentence a judge would say', () => {
    expect(describe({ kind: 'fine', amount: 2_500 }, none)).toBe('A $2,500 fine');
    expect(describe({ kind: 'fine', amount: 1_000_000 }, none)).toBe('A $1 million fine');
    expect(describe({ kind: 'probation', months: 6 }, none)).toBe("6 months' probation");
    expect(describe({ kind: 'probation', months: 12 }, none)).toBe("A year's probation");
    expect(describe({ kind: 'probation', months: 18 }, none)).toBe("18 months' probation");
    expect(describe({ kind: 'probation', months: 36 }, none)).toBe("3 years' probation");
    expect(describe({ kind: 'prison', years: 1 }, none)).toBe('1 year in prison');
    expect(describe({ kind: 'prison', years: 'life' }, none)).toBe('Life in prison');
    expect(describe({ kind: 'special' }, byId('karaoke'))).toBe('Banned from karaoke, for life');
  });
});

group('band and scores', () => {
  const kase = { fair: [2, 4] } as Pick<Case, 'fair'>;

  it('allows a little slack either side of the fair range', () => {
    expect(band(kase, 1.3)).toBe('fair');
    expect(band(kase, 1.2)).toBe('lenient');
    expect(band(kase, 4.7)).toBe('fair');
    expect(band(kase, 4.8)).toBe('harsh');
    expect(band(kase, 8)).toBe('absurd');
  });

  it('overturns the death penalty unless the case is among the worst murders', () => {
    expect(rule(byId('robin-hood'), { kind: 'death' }).band).toBe('absurd');
    expect(rule(byId('prom-crash'), { kind: 'death' }).band).toBe('absurd');
    expect(rule(byId('reservoir'), { kind: 'death' }).band).toBe('fair');
  });

  it('scores justice by distance from the fair range and approval by distance from the crowd', () => {
    expect(justiceScore(kase, 3)).toBe(100);
    expect(justiceScore(kase, 5)).toBe(82);
    expect(justiceScore(kase, 0)).toBe(64);
    expect(crowdScore({ crowd: 1 }, 1)).toBe(100);
    expect(crowdScore({ crowd: 1 }, 10)).toBe(0);
  });
});

group('rule', () => {
  it('prefers the specific headline: special, then free, then death', () => {
    const goose = byId('prom-goose');
    expect(rule(goose, { kind: 'special' }).headline).toBe(goose.special!.headline);
    const insulin = byId('insulin');
    expect(rule(insulin, { kind: 'free' }).headline).toBe(insulin.headlines.free);
    const reservoir = byId('reservoir');
    expect(rule(reservoir, { kind: 'death' }).headline).toBe(reservoir.headlines.death);
    expect(rule(reservoir, { kind: 'prison', years: 'life' }).headline).toBe(reservoir.headlines.fair);
  });

  it('says prosecutors cannot appeal when a serious defendant walks', () => {
    expect(rule(byId('vigilante'), { kind: 'free' }).experts).toMatch(/can't appeal an acquittal/);
    expect(rule(byId('bananas'), { kind: 'free' }).experts).toBe('Legal experts call it soft.');
  });

  it('never calls a ruling simply right when experts disagree', () => {
    expect(rule(byId('reservoir'), { kind: 'death' }).experts).toMatch(/split/);
    expect(rule(byId('prom-goose'), { kind: 'fine', amount: 250 }).experts).toBe('Legal experts call it proportionate.');
  });

  it('records which way a ruling leaned', () => {
    expect(rule(byId('prom-goose'), { kind: 'prison', years: 10 }).lean).toBeGreaterThan(0);
    expect(rule(byId('prom-crash'), { kind: 'free' }).lean).toBeLessThan(0);
    expect(rule(byId('prom-goose'), { kind: 'fine', amount: 500 }).lean).toBe(0);
  });
});
