import { describe, expect, it } from 'vitest';
import { Classifier, coverage, fieldCoverage, outstanding, utmStatus } from '../src/core/classify';
import { InvalidRule, compilePattern } from '../src/core/match';
import type { Field, Rule, Utm } from '../src/core/model';
import { displayUtm, normalizeParts, normalizeText, utmKey } from '../src/core/normalize';

const FIELDS: Field[] = [
  { id: 'campaign', name: 'Campaign', target: 'campaign', description: '', values: ['Summer Cup', 'Fall Kickoff'] },
  { id: 'channel', name: 'Channel', target: 'medium', description: '', values: ['Paid Social', 'Email'] },
];

let nextId = 1;
function rule(field: string, pattern: string, value: string, extra: Partial<Rule> = {}): Rule {
  return {
    id: `R${nextId++}`, field, target: field === 'channel' ? 'medium' : 'campaign', match: 'contains', pattern, value,
    priority: 100, active: true, author: 'test', createdAt: '', note: '', ...extra,
  };
}

function utm(campaign: string, medium = 'paid_social', sessions = 100): Utm {
  const parts = normalizeParts({ source: 'fb', medium, campaign });
  return { key: utmKey(parts), parts, raw: { ...parts }, spellings: [], firstSeen: '2026-01', lastSeen: '2026-01', sessions, keyEvents: 0 };
}

describe('normalization', () => {
  it.each([
    ['Summer Cup', 'summer cup'],
    ['  SUMMER   cup ', 'summer cup'],
    ['Summer%20Cup', 'summer cup'],
    ['summer+cup', 'summer cup'],
    ['summer cup', 'summer cup'],
    ['﻿summer cup', 'summer cup'],
    ['ＳＣ２６', 'sc26'],
  ])('%j → %j', (raw, expected) => {
    expect(normalizeText(raw)).toBe(expected);
  });

  it('leaves separators for rules to decide', () => {
    expect(normalizeText('summer-cup')).not.toBe(normalizeText('summer_cup'));
  });

  it('gives alike spellings one identity', () => {
    const a = utmKey(normalizeParts({ source: 'FB', medium: 'Paid_Social', campaign: 'Summer%20Cup' }));
    const b = utmKey(normalizeParts({ source: ' fb', medium: 'paid_social', campaign: 'summer cup' }));
    expect(a).toBe(b);
    expect(displayUtm({ source: 'fb', medium: 'email', campaign: 'x', content: '', term: '' })).toBe('fb / email / x');
  });
});

describe('matching', () => {
  const test = (match: Parameters<typeof compilePattern>[0], pattern: string, text: string) =>
    compilePattern(match, pattern)(normalizeText(text));

  it('supports the four match types', () => {
    expect(test('contains', 'Summer Cup', 'zestify summer cup 26')).toBe(true);
    expect(test('exact', 'fb', ' FB ')).toBe(true);
    expect(test('exact', 'fb', 'fb_paid')).toBe(false);
    expect(test('starts_with', 'fb', 'fb_paid')).toBe(true);
    expect(test('regex', 'summer[ _-]?cup', 'SUMMER_CUP_2026')).toBe(true);
  });

  it('uses a regex as written, case-insensitive', () => {
    expect(test('regex', 'cup\\D', 'cup-26')).toBe(true);
    expect(test('regex', 'cup\\D', 'cup26')).toBe(false); // lowercasing would have turned \D into \d
  });

  it('refuses catch-alls, broken regexes and empty patterns', () => {
    for (const pattern of ['.*', 'a*', '|']) expect(() => compilePattern('regex', pattern)).toThrow(/catch-all/);
    expect(() => compilePattern('regex', 'summer(')).toThrow(InvalidRule);
    expect(() => compilePattern('contains', '  %20 ')).toThrow(/empty/);
    expect(compilePattern('regex', '^$')('')).toBe(true);
  });
});

describe('classification', () => {
  it('lets the lowest priority number win', () => {
    const c = new Classifier(FIELDS, [rule('campaign', 'summer', 'Summer Cup'), rule('campaign', 'summer kick', 'Fall Kickoff', { priority: 10 })]);
    expect(c.outcome(utm('summer kickoff bridge'), 'campaign').value).toBe('Fall Kickoff');
    expect(c.outcome(utm('summer cup'), 'campaign').value).toBe('Summer Cup');
  });

  it('flags a disagreeing tie as a conflict instead of guessing', () => {
    const a = rule('campaign', 'summer', 'Summer Cup');
    const b = rule('campaign', 'kickoff', 'Fall Kickoff');
    const outcome = new Classifier(FIELDS, [a, b]).outcome(utm('summer_to_kickoff'), 'campaign');
    expect(outcome).toEqual({ status: 'conflict', value: null, rules: [a, b] });
  });

  it('accepts a tie that agrees, and records both rules', () => {
    const a = rule('campaign', 'summer', 'Summer Cup');
    const b = rule('campaign', 'sc26', 'Summer Cup');
    const outcome = new Classifier(FIELDS, [a, b]).outcome(utm('sc26 summer'), 'campaign');
    expect(outcome.status).toBe('classified');
    expect(outcome.rules).toEqual([a, b]);
  });

  it('leaves anything unmatched outstanding, never a default', () => {
    const c = new Classifier(FIELDS, [rule('campaign', 'summer', 'Summer Cup')]);
    expect(c.outcome(utm('june newsletter'), 'campaign')).toEqual({ status: 'outstanding', value: null, rules: [] });
  });

  it('ignores rules that are turned off', () => {
    const c = new Classifier(FIELDS, [rule('campaign', 'summer', 'Summer Cup', { active: false })]);
    expect(c.outcome(utm('summer'), 'campaign').status).toBe('outstanding');
  });

  it('calls a UTM classified only when every field is', () => {
    const c = new Classifier(FIELDS, [rule('campaign', 'summer', 'Summer Cup'), rule('channel', 'social', 'Paid Social'),
      rule('campaign', 'kick', 'Fall Kickoff')]);
    expect(utmStatus(c.classify(utm('summer', 'paid_social')))).toBe('classified');
    expect(utmStatus(c.classify(utm('summer', 'email')))).toBe('outstanding');
    expect(utmStatus(c.classify(utm('summer kick', 'paid_social')))).toBe('conflict');
  });

  it('counts coverage by UTM and by sessions, and lists what is outstanding by traffic', () => {
    const utms = [utm('summer', 'paid_social', 300), utm('summer', 'email', 100), utm('other', 'paid_social', 600)];
    const c = new Classifier(FIELDS, [rule('campaign', 'summer', 'Summer Cup'), rule('channel', 'social', 'Paid Social')]);
    const results = c.classifyAll(utms);
    expect(coverage(utms, results)).toEqual({ utms: 3, classified: 1, conflicts: 0, sessions: 1000, classifiedSessions: 300 });
    expect(outstanding(utms, results).map((u) => u.sessions)).toEqual([600, 100]);
    const [campaign, channel] = fieldCoverage(FIELDS, utms, results);
    expect([campaign!.classified, campaign!.outstanding, channel!.classified]).toEqual([2, 1, 2]);
  });
});
