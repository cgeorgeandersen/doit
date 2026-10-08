import { describe, expect, it } from 'vitest';
import { REMOVE, type Rule, type Table, type UtmParts } from '../src/core/model';
import { tableCsv } from '../src/core/csv';
import { describeRule, matcher, ruleProblem } from '../src/core/rules';
import { apply, coverage, emptyTable, keptUtms, previewRule, removedBy, resolve, ruleReach } from '../src/core/table';
import { addUtms, draftRule } from '../src/core/workspace';

const utm = (source: string, medium: string, campaign: string, content = '', term = ''): UtmParts => ({ source, medium, campaign, content, term });
const none = () => undefined;

function seed(): Table {
  let t = emptyTable();
  t = apply(t, { type: 'addUtms', rows: [
    utm('facebook', 'paid_social', 'summer_cup', 'video'),
    utm('google', 'cpc', '', ''), // no campaign, no content
    utm('newsletter', 'email', '', 'hero'), // no campaign, has content
    utm('test', 'test', 'qa_check', ''),
  ] }, none);
  return apply(t, { type: 'addColumn', column: { id: 'type', name: 'Type' } }, none);
}

const removeBlank: Rule = {
  id: 'x1', column: REMOVE, value: '',
  when: [{ part: 'campaign', op: 'blank', text: '' }, { part: 'content', op: 'blank', text: '' }],
};

describe('blank, not blank, and / or', () => {
  it('"is blank" and "is not blank" need no text', () => {
    const blank = matcher([{ part: 'campaign', op: 'blank', text: '' }]);
    const notBlank = matcher([{ part: 'campaign', op: 'notBlank', text: '' }]);
    expect(blank(utm('google', 'cpc', ''))).toBe(true);
    expect(blank(utm('google', 'cpc', 'x'))).toBe(false);
    expect(notBlank(utm('google', 'cpc', 'x'))).toBe(true);
  });

  it('"and" needs every condition, "or" needs any one, and rules saved before "or" existed stay "and"', () => {
    const when: Rule['when'] = [{ part: 'source', op: 'is', text: 'google' }, { part: 'source', op: 'is', text: 'bing' }];
    expect(matcher(when)(utm('bing', 'cpc', 'a'))).toBe(false);
    expect(matcher(when, 'any')(utm('bing', 'cpc', 'a'))).toBe(true);
    expect(matcher(when, 'any')(utm('yahoo', 'cpc', 'a'))).toBe(false);
  });

  it('fills cells with an "or" rule', () => {
    let t = seed();
    t = apply(t, { type: 'addRule', rule: { id: 'r1', column: 'type', value: 'Search', match: 'any',
      when: [{ part: 'source', op: 'is', text: 'google' }, { part: 'medium', op: 'is', text: 'email' }] } }, none);
    const grid = resolve(t);
    expect(coverage(t, grid).byRule).toBe(2);
    expect(describeRule(t.rules[0]!, t)).toBe('If source is "google" or medium is "email", then Type is Search');
  });
});

describe('rules that remove rows', () => {
  it('takes matching UTMs out of the table, its coverage and its export, but keeps them stored', () => {
    const t = apply(seed(), { type: 'addRule', rule: removeBlank }, none);
    expect(t.utms).toHaveLength(4);
    expect(keptUtms(t).map((u) => u.parts.source)).toEqual(['facebook', 'newsletter', 'test']);
    const grid = resolve(t);
    expect(coverage(t, grid)).toMatchObject({ utms: 3, removed: 1 });
    expect(tableCsv(t, grid, 2)).not.toContain('google');
    expect(describeRule(t.rules[0]!, t)).toBe('If campaign is blank and content is blank, then remove the row');
  });

  it('brings the rows back when the rule goes, and removes new UTMs that arrive later', () => {
    let t = apply(seed(), { type: 'addRule', rule: removeBlank }, none);
    t = apply(t, { type: 'addUtms', rows: [utm('bing', 'cpc', '')] }, none);
    expect(keptUtms(t)).toHaveLength(3);
    t = apply(t, { type: 'deleteRule', id: 'x1' }, none);
    expect(keptUtms(t)).toHaveLength(5);
  });

  it('counts what each removal rule removes, and previews a new one', () => {
    let t = apply(seed(), { type: 'addRule', rule: removeBlank }, none);
    const qa: Rule = { id: 'x2', column: REMOVE, value: '', when: [{ part: 'source', op: 'is', text: 'test' }] };
    const grid = resolve(t);
    expect(previewRule(t, grid, qa)).toMatchObject({ removes: 1 });
    t = apply(t, { type: 'addRule', rule: qa }, none);
    expect(ruleReach(t, resolve(t)).get('x2')).toEqual({ matches: 1, fills: 1 });
    expect(removedBy(t).get(t.utms[3]!.key)).toBe('x2');
  });

  it('needs conditions but no column or value, and keeps no stray text or value', () => {
    const t = seed();
    expect(ruleProblem(removeBlank, t)).toBeNull();
    expect(ruleProblem({ ...removeBlank, when: [{ part: 'campaign', op: 'contains', text: '' }] }, t)).toMatch(/Type what/);
    const drafted = draftRule(t, { column: REMOVE, value: 'ignored', match: 'any', when: [{ part: 'campaign', op: 'blank', text: 'x' }] }, 'x3');
    expect(drafted).toEqual({ id: 'x3', column: REMOVE, value: '', match: 'any', when: [{ part: 'campaign', op: 'blank', text: '' }] });
  });

  it('says which UTMs in an import your rules remove, already stored or new, and leaves them out of "new"', () => {
    const t = apply(seed(), { type: 'addRule', rule: removeBlank }, none);
    const draft = addUtms(t, [
      utm('google', 'cpc', '', ''), // stored, and removed by the rule
      utm('facebook', 'paid_social', 'summer_cup', 'video'), // stored and showing
      utm('yahoo', 'cpc', '', ''), // new, but the rule removes it
      utm('tiktok', 'paid_social', 'fall_kickoff', 'clip'), // new and showing
    ]);
    expect(draft).toMatchObject({ known: 1, removed: 2 });
    expect(draft.fresh.map((u) => u.parts.source)).toEqual(['tiktok']);
    expect(draft.summary).toBe('Added 1 UTM from a paste (1 UTM already in the table, 2 UTMs removed by your rules)');
  });
});

