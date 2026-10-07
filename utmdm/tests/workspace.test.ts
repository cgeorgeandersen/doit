import { describe, expect, it } from 'vitest';
import { classifyWorkspace, coverage, utmStatus } from '../src/core/classify';
import { utmTableCsv } from '../src/core/csv';
import { FIELDS, createDemoWorkspace, refreshFromSample } from '../src/core/demo';
import { InvalidRule } from '../src/core/match';
import type { SourceRow, Workspace } from '../src/core/model';
import { memoryStore, parseWorkspace } from '../src/core/store';
import { suggest } from '../src/core/suggest';
import {
  addRule,
  addValue,
  describeRule,
  diffRules,
  emptyWorkspace,
  ingest,
  restoreVersion,
  ruleReach,
  updateRule,
} from '../src/core/workspace';

const AT = '2026-10-07T12:00:00Z';

function row(campaign: string, extra: Partial<SourceRow> = {}): SourceRow {
  return { source: 'fb', medium: 'paid_social', campaign, content: '', term: '', period: '2026-05', sessions: 10, keyEvents: 1, ...extra };
}

function fresh(): Workspace {
  return ingest(emptyWorkspace(structuredClone(FIELDS)), [row('summer_cup'), row('SUMMER_CUP', { source: 'FB' }), row('sc-26')], {
    source: 'test',
    period: 'May',
    at: AT,
  });
}

describe('the permanent table', () => {
  it('merges spellings that normalize alike, and keeps every spelling', () => {
    const ws = fresh();
    expect(ws.utms).toHaveLength(2);
    const summer = ws.utms[0]!;
    expect(summer.spellings).toEqual(['fb / paid_social / summer_cup', 'FB / paid_social / SUMMER_CUP']);
    expect(summer.sessions).toBe(20);
    expect(ws.refreshes[0]).toMatchObject({ rows: 3, newUtms: 2, updatedUtms: 0 });
  });

  it('only grows: a refresh adds traffic and UTMs, never removes them', () => {
    const ws = ingest(fresh(), [row('summer_cup', { period: '2026-06', sessions: 5 }), row('fk26', { period: '2026-06' })], {
      source: 'test', period: 'June', at: AT,
    });
    expect(ws.utms).toHaveLength(3);
    expect(ws.utms[0]).toMatchObject({ sessions: 25, firstSeen: '2026-05', lastSeen: '2026-06' });
    expect(ws.refreshes.at(-1)).toMatchObject({ newUtms: 1, updatedUtms: 1 });
    expect(ws.refreshes.at(-1)!.newKeys).toEqual([ws.utms[2]!.key]);
  });
});

describe('rules and versions', () => {
  it('saves every rule change as a version with a full copy of the rules and its coverage', () => {
    let ws = addRule(fresh(), { field: 'campaign', target: 'campaign', match: 'contains', pattern: 'summer', value: 'Summer Cup 2026' }, AT);
    ws = updateRule(ws, 'R1', { priority: 50 }, AT);
    ws = updateRule(ws, 'R1', { active: false }, AT);
    expect(ws.versions.map((v) => v.number)).toEqual([1, 2, 3]);
    expect(ws.versions.map((v) => v.rules[0]!.priority)).toEqual([100, 50, 50]);
    expect(ws.versions.map((v) => v.message)).toEqual([
      'Add R1: utm_campaign contains "summer" → Campaign: Summer Cup 2026',
      'Edit R1',
      'Turn off R1',
    ]);
    expect(ws.versions[0]!.rules).not.toBe(ws.rules);
  });

  it('makes no version when nothing changes', () => {
    const ws = addRule(fresh(), { field: 'campaign', target: 'campaign', match: 'contains', pattern: 'summer', value: 'Summer Cup 2026' }, AT);
    expect(updateRule(ws, 'R1', { priority: 100 }, AT)).toBe(ws);
  });

  it('restores an old version as a new one, and never reuses a rule id', () => {
    let ws = addRule(fresh(), { field: 'campaign', target: 'campaign', match: 'contains', pattern: 'summer', value: 'Summer Cup 2026' }, AT);
    ws = addRule(ws, { field: 'campaign', target: 'campaign', match: 'contains', pattern: 'sc-26', value: 'Summer Cup 2026' }, AT);
    ws = restoreVersion(ws, 1, AT);
    expect(ws.versions).toHaveLength(3);
    expect(ws.rules.map((r) => r.id)).toEqual(['R1']);
    ws = addRule(ws, { field: 'channel', target: 'medium', match: 'contains', pattern: 'social', value: 'Paid Social' }, AT);
    expect(ws.rules.map((r) => r.id)).toEqual(['R1', 'R3']);
    expect(diffRules(ws.versions[1]!.rules, ws.rules).map((c) => [c.kind, c.id])).toEqual([['removed', 'R2'], ['added', 'R3']]);
  });

  it('keeps values controlled', () => {
    const draft = { field: 'campaign', target: 'campaign', match: 'contains', pattern: 'x', value: 'Holiday 2026' } as const;
    expect(() => addRule(fresh(), draft, AT)).toThrow(/isn't a Campaign value/);
    const ws = addValue(fresh(), 'campaign', '  Holiday   2026 ');
    expect(addRule(ws, draft, AT).rules[0]!.value).toBe('Holiday 2026');
    expect(() => addValue(ws, 'campaign', 'holiday 2026')).toThrow(/already has/);
    expect(() => addRule(fresh(), { ...draft, value: 'Summer Cup 2026', match: 'regex', pattern: '.*' }, AT)).toThrow(InvalidRule);
    expect(() => addRule(fresh(), { ...draft, value: 'Summer Cup 2026', priority: -1 }, AT)).toThrow(/Priority/);
  });

  it('tests a rule before it exists, and reads it back in plain words', () => {
    const ws = fresh();
    const reach = ruleReach(ws, classifyWorkspace(ws), { field: 'campaign', target: 'campaign', match: 'regex', pattern: 'summer|sc' });
    expect([reach.utms.length, reach.sessions, reach.open]).toEqual([2, 30, 2]);
    expect(describeRule({ field: 'campaign', target: 'any', match: 'exact', pattern: ws.utms[1]!.key, value: 'Summer Cup 2026' }, ws.fields))
      .toBe('this UTM only (fb / paid_social / sc-26) → Campaign: Summer Cup 2026');
  });
});

describe('the demo', () => {
  it('opens with four months loaded, the starter rules, and real work outstanding', () => {
    const ws = createDemoWorkspace(AT);
    const cov = coverage(ws.utms, classifyWorkspace(ws));
    expect(ws.versions).toHaveLength(1);
    expect(ws.refreshes).toHaveLength(1);
    expect(cov.classified / cov.utms).toBeGreaterThan(0.6);
    expect(cov.classified / cov.utms).toBeLessThan(0.8);
    expect(cov.conflicts).toBeGreaterThan(0);
  });

  it('is the same for everyone, and each refresh brings the next month', () => {
    expect(JSON.stringify(createDemoWorkspace(AT))).toBe(JSON.stringify(createDemoWorkspace(AT)));
    let ws = createDemoWorkspace(AT);
    ws = refreshFromSample(ws, AT)!;
    expect(ws.refreshes.at(-1)!.period).toBe('May 2026');
    const results = classifyWorkspace(ws);
    const summer = ws.utms.filter((u) => /summer|sc/.test(u.parts.campaign) && ws.refreshes.at(-1)!.newKeys.includes(u.key));
    expect(summer.length).toBeGreaterThan(10);
    expect(summer.some((u) => results.get(u.key)!.campaign!.status === 'outstanding')).toBe(true);
    for (let i = 0; i < 4; i++) ws = refreshFromSample(ws, AT)!;
    expect(refreshFromSample(ws, AT)).toBeNull(); // the sample ends in September
  });

  it('suggests what an outstanding UTM means', () => {
    const ws = createDemoWorkspace(AT);
    const results = classifyWorkspace(ws);
    const campaign = ws.fields.find((f) => f.id === 'campaign')!;
    const top = (text: string) => {
      const u = ws.utms.find((x) => x.parts.campaign === text)!;
      return suggest(u, campaign, ws, results)[0]!;
    };
    expect(top('sr26_launch')).toMatchObject({ value: 'Spring Refresh 2026', reason: '"sr" spells its initials' });
    expect(top('ww26_promo').value).toBe('Winter Warmup 2026');
    expect(top('spring_reresh_26').value).toBe('Spring Refresh 2026'); // a typo
    expect(suggest(ws.utms.find((x) => x.parts.campaign === 'password_reset')!, campaign, ws, results)).toEqual([]);
  });
});

describe('export and storage', () => {
  it('exports the table with each classification, its rule and the rules version', () => {
    const ws = addRule(fresh(), { field: 'campaign', target: 'campaign', match: 'contains', pattern: 'summer', value: 'Summer Cup 2026' }, AT);
    const lines = utmTableCsv(ws, classifyWorkspace(ws)).trim().split('\n');
    expect(lines[0]).toBe('utm_source,utm_medium,utm_campaign,utm_content,utm_term,first_seen,last_seen,sessions,key_events,status,'
      + 'channel,channel_rule,campaign,campaign_rule,type,type_rule,rules_version');
    expect(lines[1]).toContain('Summer Cup 2026,R1');
    expect(lines[1]!.endsWith(',1')).toBe(true);
    expect(lines[2]).toContain('[outstanding]');
  });

  it('neutralizes spreadsheet formulas in exported cells', () => {
    const ws = ingest(emptyWorkspace(structuredClone(FIELDS)), [row('=HYPERLINK("x")')], { source: 't', period: 'p', at: AT });
    expect(utmTableCsv(ws, classifyWorkspace(ws))).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('round-trips a workspace and refuses files that are not one', () => {
    const store = memoryStore();
    const ws = createDemoWorkspace(AT);
    store.save(ws);
    expect(store.load()).toEqual(ws);
    expect(parseWorkspace(JSON.stringify(ws))).toEqual(ws);
    expect(() => parseWorkspace('{"hello": 1}')).toThrow(/isn't a UTMDM backup/);
    expect(utmStatus(undefined)).toBe('outstanding');
  });
});
