/**
 * Checks on src/content.ts, so an edit that would break the page fails here
 * with a message that says what to fix.
 */
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { MODES, say, type Text } from '../src/lib/model';

/** Every string anywhere in the content, with where it is. */
function strings(value: unknown, path = 'CONTENT'): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  return [];
}

const ALL = strings(CONTENT);
const questions = CONTENT.dimensions.flatMap((d) => d.questions.map((q) => ({ d, q })));

/** Both modes of a piece of text. */
const both = (text: Text) => MODES.map((mode) => say(text, mode));

describe('structure', () => {
  it('has six dimensions of three questions each', () => {
    expect(CONTENT.dimensions.map((d) => [d.name, d.questions.length])).toEqual(CONTENT.dimensions.map((d) => [d.name, 3]));
    expect(CONTENT.dimensions).toHaveLength(6);
  });

  it('gives every question exactly four options, least ready first', () => {
    for (const { q } of questions) expect(q.options, `question "${q.id}" needs exactly four options`).toHaveLength(4);
  });

  it('uses each id once', () => {
    const ids = [...CONTENT.dimensions.map((d) => d.id), ...questions.map(({ q }) => q.id)];
    expect(ids.filter((id, i) => ids.indexOf(id) !== i), 'repeated ids').toEqual([]);
  });

  it('links every dimension to a framework that exists', () => {
    const known = Object.keys(CONTENT.frameworks);
    for (const d of CONTENT.dimensions) expect(known, `dimension "${d.name}" names framework "${d.framework}"`).toContain(d.framework);
  });

  it('points each framework at its page on the portfolio', () => {
    for (const [id, f] of Object.entries(CONTENT.frameworks)) {
      expect(f.path).toBe(`/frameworks/${id}`);
      expect(f.symbol).toMatch(/^[A-Z][a-z]?$/);
    }
  });

  it('has four stages, starting at 0 and rising', () => {
    const mins = CONTENT.stages.map((s) => s.minAverage);
    expect(CONTENT.stages.map((s) => s.name)).toEqual(['Magic', 'Alchemy', 'Chemistry', 'Boring']);
    expect(mins[0]).toBe(0);
    for (let i = 1; i < mins.length; i++) expect(mins[i]!, `stage ${i + 1} must start above stage ${i}`).toBeGreaterThan(mins[i - 1]!);
    expect(mins.at(-1)!).toBeLessThanOrEqual(3);
  });

  it('defines each stage in one sentence', () => {
    for (const s of CONTENT.stages) {
      const sentences = s.definition.trim().split(/[.!?](?:\s+|$)/).filter(Boolean);
      expect(sentences, `the ${s.name} definition should be one sentence`).toHaveLength(1);
    }
  });

  it('has sensible rules', () => {
    const { weakestLinkCap, gapCount } = CONTENT.rules;
    expect(weakestLinkCap === null || (Number.isInteger(weakestLinkCap) && weakestLinkCap >= 1)).toBe(true);
    expect(gapCount).toBeGreaterThanOrEqual(1);
    expect(gapCount).toBeLessThanOrEqual(CONTENT.dimensions.length);
  });
});

describe('words', () => {
  it('leaves no text empty, in either mode', () => {
    // The site's own address may stay empty until it has a domain.
    for (const { path, text } of ALL.filter(({ path }) => path !== 'CONTENT.site.url')) expect(text.trim(), `${path} is empty`).not.toBe('');
  });

  it('only uses a mode-specific version where the two actually differ', () => {
    for (const { q } of questions) {
      for (const text of [q.prompt, q.nextStep, ...q.options]) {
        if (typeof text !== 'string') expect(text.department, `question "${q.id}": both versions are the same`).not.toBe(text.company);
      }
    }
  });

  it('keeps questions and options short enough to read on a phone', () => {
    for (const { q } of questions) {
      for (const prompt of both(q.prompt)) expect(prompt.length, `question "${q.id}": shorten the question`).toBeLessThanOrEqual(120);
      q.options.forEach((option, i) => {
        for (const text of both(option)) expect(text.length, `question "${q.id}", option ${i + 1}: shorten it`).toBeLessThanOrEqual(150);
      });
      for (const step of both(q.nextStep)) expect(step.length, `question "${q.id}": shorten the next step`).toBeLessThanOrEqual(280);
    }
  });

  it('has no emoji', () => {
    for (const { path, text } of ALL) expect(text, `${path} has an emoji`).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('stays plain: no hype words', () => {
    const hype = /\b(revolutioni[sz]e|game[- ]?chang|unlock|leverag|synerg|cutting[- ]edge|seamless|supercharg|transformative|world[- ]class|best[- ]in[- ]class|next[- ]gen|paradigm|disrupt|empower|holistic|journey|robust)/i;
    for (const { path, text } of ALL) expect(text, `${path}`).not.toMatch(hype);
  });

  it('describes situations, not agree/disagree scales', () => {
    for (const { q } of questions) for (const option of q.options) for (const text of both(option)) expect(text).not.toMatch(/\b(strongly )?(dis)?agree\b/i);
  });

  it('makes no comparison with other organizations', () => {
    const claims = /\bpercentile\b|\btop \d+ ?%|\d+ ?% of (companies|organi[sz]ations|teams|leaders)|better than (most|other)|ahead of (most|other|your peers)|compared (to|with) (most|other|your peers)/i;
    for (const { path, text } of ALL) expect(text, path).not.toMatch(claims);
  });

  it('says plainly that the result is a self-reported snapshot, not a benchmark', () => {
    expect(CONTENT.results.about.paragraphs.join(' ')).toMatch(/not a benchmark/);
    expect(CONTENT.results.snapshot).toMatch(/self-reported/i);
  });

  it('only uses placeholders the page knows how to fill', () => {
    const known = new Set(['n', 'total', 'points', 'max', 'average', 'uncapped', 'dimension', 'weakStage', 'steps', 'count', 'framework', 'date', 'questions', 'thresholds', 'stage', 'next', 'min', 'mode']);
    for (const { path, text } of ALL) {
      for (const [, name] of text.matchAll(/\{(\w+)\}/g)) expect(known.has(name!), `${path} uses {${name}}, which the page doesn't fill`).toBe(true);
    }
  });

  it('keeps the placeholders each template needs', () => {
    const needs: [string, string, string[]][] = [
      ['quiz.progress', CONTENT.quiz.progress, ['n', 'total']],
      ['results.points', CONTENT.results.points, ['points', 'max', 'average']],
      ['results.capped', CONTENT.results.capped, ['uncapped', 'dimension', 'weakStage']],
      ['results.dimensionPoints', CONTENT.results.dimensionPoints, ['points', 'max']],
      ['results.gapTag', CONTENT.results.gapTag, ['n']],
      ['results.stamp', CONTENT.results.stamp, ['date']],
      ['results.gaps.heading.own', CONTENT.results.gaps.heading.own, ['count']],
      ['results.gaps.heading.shared', CONTENT.results.gaps.heading.shared, ['count']],
      ['results.gaps.read', CONTENT.results.gaps.read, ['framework']],
      ['results.about.thresholdFirst', CONTENT.results.about.thresholdFirst, ['stage', 'next']],
      ['results.about.thresholdOther', CONTENT.results.about.thresholdOther, ['stage', 'min']],
    ];
    for (const [path, text, names] of needs) for (const name of names) expect(text, `${path} needs {${name}}`).toContain(`{${name}}`);
  });

  it('puts the emphasized word in the headline', () => {
    expect(CONTENT.intro.title).toContain(CONTENT.intro.emphasis);
  });
});
