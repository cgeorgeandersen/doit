import { describe, expect, it } from 'vitest';
import type { Rule, Table, UtmParts } from '../src/core/model';
import { describeRule, matcher, ruleProblem } from '../src/core/rules';
import { apply, canonicalValue, cellOf, columnValues, coverage, emptyTable, previewRule, resolve, ruleReach } from '../src/core/table';

const utm = (source: string, medium: string, campaign: string, content = '', term = ''): UtmParts => ({ source, medium, campaign, content, term });
const none = () => undefined;

function seed(): Table {
  let t = emptyTable();
  t = apply(t, { type: 'addUtms', rows: [
    utm('facebook', 'paid_social', 'summer_cup_2026'),
    utm('FB', 'cpc', 'SC26_promo'),
    utm('google', 'cpc', 'Summer%20Cup'),
    utm('newsletter', 'email', 'password_reset'),
  ] }, none);
  t = apply(t, { type: 'batch', ops: [
    { type: 'addColumn', column: { id: 'type', name: 'Type' } },
    { type: 'addColumn', column: { id: 'channel', name: 'Channel' } },
  ] }, none);
  return t;
}
const rule = (id: string, column: string, text: string, value: string, part: Rule['when'][0]['part'] = 'campaign'): Rule =>
  ({ id, column, when: [{ part, op: 'contains', text }], value });

describe('the table', () => {
  it('merges spellings that differ only in capitals, spaces or URL encoding, and keeps every spelling', () => {
    let t = seed();
    t = apply(t, { type: 'addUtms', rows: [utm('  Facebook ', 'PAID_SOCIAL', 'SUMMER_CUP_2026'), utm('google', 'cpc', 'summer cup')] }, none);
    expect(t.utms).toHaveLength(4);
    expect(t.utms[0]!.spellings).toEqual(['facebook / paid_social / summer_cup_2026', 'Facebook / PAID_SOCIAL / SUMMER_CUP_2026']);
    expect(t.utms[0]!.raw.source).toBe('facebook'); // the first spelling is the one shown
    expect(t.utms[2]!.spellings).toHaveLength(2);
  });

  it('keeps "summer-cup" and "summer_cup" apart: that call belongs to a rule', () => {
    const t = apply(emptyTable(), { type: 'addUtms', rows: [utm('a', 'b', 'summer-cup'), utm('a', 'b', 'summer_cup')] }, none);
    expect(t.utms).toHaveLength(2);
  });

  it('fills a cell with a typed value first, then the first matching rule, otherwise leaves it empty', () => {
    let t = seed();
    t = apply(t, { type: 'addRule', rule: rule('r1', 'type', 'cup', 'Marketing') }, none);
    t = apply(t, { type: 'addRule', rule: rule('r2', 'type', 'summer', 'Seasonal') }, none);
    const fb = t.utms[1]!.key;
    t = apply(t, { type: 'setCell', column: 'type', utm: fb, value: 'Promo' }, none);
    const grid = resolve(t);
    expect(cellOf(grid, t.utms[0]!.key, 'type')).toMatchObject({ value: 'Marketing', from: 'rule', rule: { id: 'r1' } });
    expect(cellOf(grid, t.utms[2]!.key, 'type')).toMatchObject({ value: 'Marketing', from: 'rule' }); // "Summer%20Cup" reads "summer cup"
    expect(cellOf(grid, fb, 'type')).toMatchObject({ value: 'Promo', from: 'typed' });
    expect(cellOf(grid, t.utms[3]!.key, 'type')).toMatchObject({ value: '', from: 'empty' });
  });

  it('lets the earlier rule win, and moving a rule up changes the outcome', () => {
    let t = seed();
    t = apply(t, { type: 'addRule', rule: rule('r1', 'type', 'summer', 'Seasonal') }, none);
    t = apply(t, { type: 'addRule', rule: rule('r2', 'type', 'cup', 'Marketing') }, none);
    expect(cellOf(resolve(t), t.utms[0]!.key, 'type').value).toBe('Seasonal');
    t = apply(t, { type: 'moveRule', id: 'r2', to: 0 }, none);
    expect(cellOf(resolve(t), t.utms[0]!.key, 'type').value).toBe('Marketing');
    expect(t.rules.map((r) => r.id)).toEqual(['r2', 'r1']);
  });

  it('clearing a typed value hands the cell back to the rules', () => {
    let t = apply(seed(), { type: 'addRule', rule: rule('r1', 'type', 'cup', 'Marketing') }, none);
    const key = t.utms[0]!.key;
    t = apply(t, { type: 'setCell', column: 'type', utm: key, value: 'Promo' }, none);
    t = apply(t, { type: 'setCell', column: 'type', utm: key, value: '  ' }, none);
    expect(cellOf(resolve(t), key, 'type')).toMatchObject({ value: 'Marketing', from: 'rule' });
  });

  it('needs every condition of a rule to match', () => {
    const test = matcher([{ part: 'source', op: 'contains', text: 'google' }, { part: 'medium', op: 'is', text: 'CPC' }]);
    const t = seed();
    expect(t.utms.filter((u) => test(u.parts)).map((u) => u.raw.source)).toEqual(['google']);
  });

  it('reads is, starts with and ends with literally, and never matches on empty text', () => {
    const parts = seed().utms[0]!.parts;
    expect(matcher([{ part: 'campaign', op: 'is', text: 'summer_cup' }])(parts)).toBe(false);
    expect(matcher([{ part: 'campaign', op: 'starts', text: 'SUMMER' }])(parts)).toBe(true);
    expect(matcher([{ part: 'campaign', op: 'ends', text: '2026' }])(parts)).toBe(true);
    expect(matcher([{ part: 'campaign', op: 'contains', text: ' ' }])(parts)).toBe(false);
  });

  it('deleting a column takes its rules and typed values with it', () => {
    let t = apply(seed(), { type: 'addRule', rule: rule('r1', 'type', 'cup', 'Marketing') }, none);
    t = apply(t, { type: 'setCell', column: 'type', utm: t.utms[0]!.key, value: 'Promo' }, none);
    t = apply(t, { type: 'deleteColumn', id: 'type' }, none);
    expect(t.columns.map((c) => c.id)).toEqual(['channel']);
    expect(t.rules).toEqual([]);
    expect(t.typed.type).toBeUndefined();
  });

  it('counts a UTM as complete only when every column has a value', () => {
    let t = seed();
    t = apply(t, { type: 'addRule', rule: rule('r1', 'type', 'cup', 'Marketing') }, none);
    t = apply(t, { type: 'addRule', rule: rule('r2', 'channel', 'social', 'Social', 'medium') }, none);
    const cov = coverage(t, resolve(t));
    expect(cov).toMatchObject({ utms: 4, complete: 1, cells: 8, byRule: 3, typed: 0, empty: 5 });
    expect(cov.columns.map((c) => c.filled)).toEqual([2, 1]);
    expect(coverage(emptyTable(), resolve(emptyTable())).complete).toBe(0);
  });

  it('reports how many cells each rule fills, and how many matches a rule above already took', () => {
    let t = seed();
    t = apply(t, { type: 'addRule', rule: rule('r1', 'type', 'summer', 'Seasonal') }, none);
    t = apply(t, { type: 'addRule', rule: rule('r2', 'type', 'cup', 'Marketing') }, none);
    const reach = ruleReach(t, resolve(t));
    expect(reach.get('r1')).toEqual({ matches: 2, fills: 2 });
    expect(reach.get('r2')).toEqual({ matches: 2, fills: 0 });
  });

  it('previews a rule before it is saved', () => {
    let t = seed();
    t = apply(t, { type: 'addRule', rule: rule('r1', 'type', 'summer', 'Seasonal') }, none);
    t = apply(t, { type: 'addRule', rule: rule('r2', 'channel', 'cpc', 'Search', 'medium') }, none);
    const p = previewRule(t, resolve(t), rule('new', 'type', 'cup', 'Marketing'));
    expect(p.matches).toHaveLength(2);
    expect(p).toMatchObject({ fillsEmpty: 0, takenAbove: 2, typed: 0 });
    const q = previewRule(t, resolve(t), rule('new', 'type', 'sc26', 'Marketing'));
    expect(q).toMatchObject({ fillsEmpty: 1, completes: 1 });
  });

  it('snaps a typed value to the spelling the column already uses', () => {
    const t = apply(seed(), { type: 'addRule', rule: rule('r1', 'channel', 'social', 'Paid Social', 'medium') }, none);
    expect(canonicalValue(t, 'channel', '  paid   SOCIAL ')).toBe('Paid Social');
    expect(canonicalValue(t, 'channel', 'Email')).toBe('Email');
    expect(columnValues(t, 'channel')).toEqual(['Paid Social']);
  });

  it('describes a rule as a sentence and says why one cannot be saved', () => {
    const t = seed();
    const r: Rule = { id: 'x', column: 'channel', when: [{ part: 'source', op: 'contains', text: 'google' }, { part: 'medium', op: 'is', text: 'cpc' }], value: 'Search' };
    expect(describeRule(r, t)).toBe('If source contains "google" and medium is "cpc", then Channel is Search');
    expect(ruleProblem(r, t)).toBeNull();
    expect(ruleProblem({ ...r, value: ' ' }, t)).toMatch(/value/);
    expect(ruleProblem({ ...r, when: [{ part: 'source', op: 'is', text: '' }] }, t)).toMatch(/Type what/);
    expect(ruleProblem({ ...r, column: 'gone' }, t)).toMatch(/column/);
  });
});
