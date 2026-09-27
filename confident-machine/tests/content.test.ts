/**
 * Content integrity: every dated claim is well formed, every citation on the
 * page resolves to a source, and the interactive content points at real
 * sources too. These tests guard the essay's promise that nothing is unsourced.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import timelyJson from '../src/content/timely.json';
import { SOURCES } from '../src/content/sources';
import { QUIZ, QUIZ_SOURCES } from '../src/content/quiz';
import { FRONTIER, FRONTIER_SOURCES } from '../src/content/frontier';
import { TASKS, TIPS, quadrantOf, type Quadrant } from '../src/content/trustmap';
import { DILEMMAS, DILEMMA_SOURCES } from '../src/content/dilemmas';

interface Entry {
  id: string;
  section: string;
  claim: string;
  sourceName: string;
  sourceUrl: string;
  asOf: string;
  lastChecked: string;
  contested?: boolean;
}

const ENTRIES = timelyJson.entries as Entry[];
const HALF = timelyJson.halfLife.claims;
const REVIEWED = timelyJson.meta.lastReviewed;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Sites that do not serve a valid certificate; linked over http on purpose. */
const HTTP_ALLOWED = ['english.scio.gov.cn'];

function validUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || (u.protocol === 'http:' && HTTP_ALLOWED.includes(u.hostname));
  } catch {
    return false;
  }
}

function realDate(iso: string): boolean {
  if (!ISO.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

const timelyIds = new Set(ENTRIES.map((e) => e.id));
const resolves = (key: string) =>
  key.startsWith('timely:') ? timelyIds.has(key.slice('timely:'.length)) : Object.prototype.hasOwnProperty.call(SOURCES, key);

describe('timely.json', () => {
  it('has unique ids', () => {
    expect(timelyIds.size).toBe(ENTRIES.length);
  });

  it('gives every claim a source, a date it describes and a date it was checked', () => {
    for (const e of ENTRIES) {
      expect(e.claim.length, e.id).toBeGreaterThan(20);
      expect(e.sourceName.length, e.id).toBeGreaterThan(3);
      expect(validUrl(e.sourceUrl), `${e.id} url`).toBe(true);
      expect(realDate(e.asOf), `${e.id} asOf`).toBe(true);
      expect(realDate(e.lastChecked), `${e.id} lastChecked`).toBe(true);
      expect(e.asOf <= e.lastChecked, `${e.id}: described date after check date`).toBe(true);
      expect(e.lastChecked <= REVIEWED, `${e.id}: checked after the file was reviewed`).toBe(true);
    }
  });

  it('uses typographic quotes in reader-facing text', () => {
    for (const e of ENTRIES) expect(e.claim, e.id).not.toMatch(/["']/);
  });

  it('labels the topics the brief calls contested', () => {
    for (const id of ['jobs-young-workers', 'jobs-no-footprint', 'researcher-timelines', 'extreme-risk', 'forecaster-split']) {
      expect(ENTRIES.find((e) => e.id === id)?.contested, id).toBe(true);
    }
  });

  it('keeps half-life claims in date order with a source for each change', () => {
    for (const c of HALF) {
      expect(['overtaken', 'revised', 'standing']).toContain(c.status);
      expect(realDate(c.statedOn), c.id).toBe(true);
      expect(validUrl(c.statedUrl) && validUrl(c.updateUrl), c.id).toBe(true);
      if (c.status !== 'standing') {
        expect(c.overtakenOn && realDate(c.overtakenOn), `${c.id} overtakenOn`).toBeTruthy();
        expect(c.statedOn < c.overtakenOn!, c.id).toBe(true);
      }
    }
  });

  it('has chart data in the shape the charts expect', () => {
    const metr = ENTRIES.find((e) => e.id === 'metr-horizon') as unknown as {
      data: { series: Array<{ date: string; p50: number; p80: number }> };
    };
    const series = metr.data.series;
    expect(series.length).toBeGreaterThan(10);
    series.forEach((p, i) => {
      expect(realDate(p.date)).toBe(true);
      expect(p.p50).toBeGreaterThan(p.p80); // succeeding more often means shorter tasks
      if (i) expect(p.date >= series[i - 1]!.date).toBe(true);
    });
  });
});

describe('sources', () => {
  it('each have a title and date, and a secure link unless the work is offline', () => {
    for (const [key, s] of Object.entries(SOURCES)) {
      expect(s.title.length, key).toBeGreaterThan(3);
      expect(s.date.length, key).toBeGreaterThan(3);
      if (s.url) expect(validUrl(s.url), `${key} url`).toBe(true);
    }
  });

  it('cover every citation, timely claim and declared source in the page', () => {
    const dir = join(__dirname, '../src/html');
    const missing: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.html'))) {
      const html = readFileSync(join(dir, file), 'utf8');
      for (const [, keys] of html.matchAll(/data-(?:cite|sources)="([^"]+)"/g)) {
        for (const key of keys!.split(/\s+/).filter(Boolean)) if (!resolves(key)) missing.push(`${file}: ${key}`);
      }
      for (const [, id] of html.matchAll(/data-timely="([^"]+)"/g)) if (!timelyIds.has(id!)) missing.push(`${file}: timely ${id}`);
    }
    expect(missing).toEqual([]);
  });

  it('cover the interactive content', () => {
    const keys = [...QUIZ_SOURCES, ...FRONTIER_SOURCES, ...DILEMMA_SOURCES, ...TIPS.flatMap((t) => t.sources)];
    expect(keys.filter((k) => !resolves(k))).toEqual([]);
  });
});

describe('interactive content', () => {
  it('quiz: ten two-option questions with a valid answer and an explanation', () => {
    expect(QUIZ).toHaveLength(10);
    for (const q of QUIZ) {
      expect(q.options).toHaveLength(2);
      expect([0, 1]).toContain(q.answer);
      expect(q.explanation.length).toBeGreaterThan(30);
      expect(q.sources.length).toBeGreaterThan(0);
    }
    // Not all the same answer position, so position can't be learned.
    expect(new Set(QUIZ.map((q) => q.answer)).size).toBe(2);
  });

  it('frontier: twelve tasks, balanced between the two verdicts, each sourced', () => {
    expect(FRONTIER).toHaveLength(12);
    expect(FRONTIER.filter((c) => c.verdict === 'great')).toHaveLength(6);
    for (const c of FRONTIER) expect(c.sources.length, c.id).toBeGreaterThan(0);
  });

  it('trust map: tasks on the unit square, with every quadrant represented', () => {
    const seen = new Set<Quadrant>();
    for (const t of TASKS) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(1);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThanOrEqual(1);
      seen.add(quadrantOf(t.x, t.y));
    }
    expect(seen.size).toBe(4);
  });

  it('dilemmas: three choices each, every one with a gain and a risk', () => {
    expect(DILEMMAS).toHaveLength(3);
    for (const d of DILEMMAS) {
      expect(d.choices).toHaveLength(3);
      for (const c of d.choices) {
        expect(c.gains.length).toBeGreaterThan(3);
        expect(c.risks.length).toBeGreaterThan(3);
      }
    }
  });
});
