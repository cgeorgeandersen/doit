import { describe, expect, it } from 'vitest';
import { buildScenario, generateApplicants, labelHistory, runScenario, selectionRates, type FeatureKey } from '../src/engine/hiring';

const WITH_PROXY: FeatureKey[] = ['skill', 'experience', 'eastfield'];
const WITHOUT_PROXY: FeatureKey[] = ['skill', 'experience'];

describe('the synthetic world is what the essay says it is', () => {
  const scenario = buildScenario();
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const inGroup = (g: 'A' | 'B') => scenario.history.filter((a) => a.group === g);

  it('gives both groups the same qualifications', () => {
    expect(Math.abs(mean(inGroup('A').map((a) => a.skill)) - mean(inGroup('B').map((a) => a.skill)))).toBeLessThan(1.5);
    expect(Math.abs(mean(inGroup('A').map((a) => a.experience)) - mean(inGroup('B').map((a) => a.experience)))).toBeLessThan(0.4);
  });

  it('records past decisions that favoured group A', () => {
    const rate = (g: 'A' | 'B') => mean(inGroup(g).map((a) => a.hired ?? 0));
    expect(rate('B')).toBeLessThan(rate('A') * 0.6);
  });

  it('puts most of group B in Eastfield, making the zip code a proxy', () => {
    const shareEast = (g: 'A' | 'B') => mean(inGroup(g).map((a) => a.eastfield));
    expect(shareEast('B')).toBeGreaterThan(0.7);
    expect(shareEast('A')).toBeLessThan(0.3);
  });
});

describe('bias demo', () => {
  const scenario = buildScenario();
  const withProxy = runScenario(scenario, WITH_PROXY);
  const withoutProxy = runScenario(scenario, WITHOUT_PROXY);

  it('shows a selection-rate ratio below 0.8 when the proxy is present, even though group is never a feature', () => {
    expect(WITH_PROXY).not.toContain('groupB');
    expect(withProxy.fairness.impactRatio).toBeLessThan(0.8);
    expect(withProxy.fairness.disadvantaged).toBe('B');
    expect(withProxy.fairness.passesFourFifths).toBe(false);
  });

  it('shows a clear improvement when the proxy is removed', () => {
    expect(withoutProxy.fairness.impactRatio - withProxy.fairness.impactRatio).toBeGreaterThan(0.15);
    expect(withoutProxy.fairness.impactRatio).toBeGreaterThanOrEqual(0.85);
    expect(withoutProxy.fairness.passesFourFifths).toBe(true);
  });

  it('holds across different random worlds, not just one lucky seed', () => {
    for (const seed of [1, 2, 3, 4, 5, 99, 2024]) {
      const s = buildScenario(seed);
      const a = runScenario(s, WITH_PROXY).fairness.impactRatio;
      const b = runScenario(s, WITHOUT_PROXY).fairness.impactRatio;
      expect(a).toBeLessThan(0.8);
      expect(b - a).toBeGreaterThan(0.15);
    }
  });

  it('learns a penalty on the zip code: it found the proxy', () => {
    const eastWeight = withProxy.model.weights[withProxy.model.featureNames.indexOf('eastfield')]!;
    const skillWeight = withProxy.model.weights[withProxy.model.featureNames.indexOf('skill')]!;
    expect(eastWeight).toBeLessThan(-0.2);
    expect(skillWeight).toBeGreaterThan(0.5);
  });

  it('is "better" at reproducing past decisions with the proxy, because the past was biased', () => {
    expect(withProxy.agreement).toBeGreaterThan(withoutProxy.agreement);
  });

  it('is worse still if the group itself is used', () => {
    const direct = runScenario(scenario, ['skill', 'experience', 'groupB']);
    expect(direct.fairness.impactRatio).toBeLessThan(withProxy.fairness.impactRatio);
  });

  it('can explain a decision with a counterfactual when the proxy is in use', () => {
    const cf = withProxy.counterfactual;
    expect(cf).not.toBeNull();
    expect(cf!.applicant.eastfield).toBe(1);
    expect(cf!.scoreNow).toBeLessThanOrEqual(cf!.cutoff);
    expect(cf!.scoreIfMoved).toBeGreaterThan(cf!.cutoff);
    expect(withoutProxy.counterfactual).toBeNull();
  });

  it('advances exactly the requested share of the pool', () => {
    expect(withProxy.screening.advanced.filter(Boolean).length).toBe(Math.round(0.3 * scenario.pool.length));
  });
});

describe('selection rates', () => {
  it('computes the impact ratio as lower rate over higher rate', () => {
    const pool = generateApplicants(4, 1).map((a, i) => ({ ...a, group: (i < 2 ? 'A' : 'B') as 'A' | 'B' }));
    const report = selectionRates(pool, [true, true, true, false]);
    expect(report.rates.A.rate).toBe(1);
    expect(report.rates.B.rate).toBe(0.5);
    expect(report.impactRatio).toBe(0.5);
  });

  it('is deterministic for a fixed seed', () => {
    expect(labelHistory(generateApplicants(50, 3), 3)).toEqual(labelHistory(generateApplicants(50, 3), 3));
  });
});
