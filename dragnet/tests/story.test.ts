import { describe, expect, it } from 'vitest';
import { CASES } from '../src/story/cases';
import { SOURCES, type SourceId } from '../src/story/sources';

describe('the shift', () => {
  it('runs its cases in time order', () => {
    const times = CASES.map((c) => c.at[0] * 60 + c.at[1]);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(times[0]).toBe(14 * 60);
    expect(times[times.length - 1]).toBeLessThan(22 * 60);
  });

  it('gives every case a lesson with sources that exist', () => {
    for (const c of CASES) {
      expect(c.lesson.sources.length, c.id).toBeGreaterThan(0);
      for (const id of c.lesson.sources) expect(SOURCES[id as SourceId], `${c.id} cites ${id}`).toBeDefined();
      expect(c.real.length).toBeGreaterThan(20);
    }
  });

  it('only links steps that exist', () => {
    for (const c of CASES) {
      const ids = new Set(c.steps.map((s) => s.id));
      expect(ids.size, c.id).toBe(c.steps.length);
      for (const step of c.steps) {
        if (step.auto) expect(ids.has(step.auto.next), `${c.id}/${step.id} auto`).toBe(true);
        const choiceIds = step.choices.map((ch) => ch.id);
        expect(new Set(choiceIds).size, `${c.id}/${step.id}`).toBe(choiceIds.length);
        for (const ch of step.choices) if (ch.next) expect(ids.has(ch.next), `${c.id}/${step.id}/${ch.id}`).toBe(true);
      }
    }
  });

  it('cites only https sources', () => {
    for (const s of Object.values(SOURCES)) expect(s.url).toMatch(/^https:\/\//);
  });

  it('uses every source somewhere', () => {
    const cited = new Set(CASES.flatMap((c) => c.lesson.sources));
    const elsewhere = new Set(['atlas', 'ccops', 'trackthepole']);
    for (const id of Object.keys(SOURCES)) expect(cited.has(id as SourceId) || elsewhere.has(id), id).toBe(true);
  });
});
