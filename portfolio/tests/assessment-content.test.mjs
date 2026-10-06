/**
 * Checks on src/assessment/content.ts, so an edit that would break the page
 * fails here with a message that says what to fix.
 */
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { ASSESSMENT } from '../src/assessment/content.ts';
import { MODES, say } from '../src/assessment/model.ts';

/** Every string anywhere in the content, with where it is. */
function strings(value, path = 'ASSESSMENT') {
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  return [];
}

const ALL = strings(ASSESSMENT);
const questions = ASSESSMENT.dimensions.flatMap((d) => d.questions.map((q) => ({ d, q })));
const both = (text) => MODES.map((mode) => say(text, mode));
const frameworkFiles = readdirSync(resolve(import.meta.dirname, '../src/content/frameworks'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.slice(0, -3));

describe('structure', () => {
  it('has six dimensions of three questions each', () => {
    assert.equal(ASSESSMENT.dimensions.length, 6);
    for (const d of ASSESSMENT.dimensions) assert.equal(d.questions.length, 3, `"${d.name}" needs exactly three questions`);
  });

  it('gives every question exactly four options, least ready first', () => {
    for (const { q } of questions) assert.equal(q.options.length, 4, `question "${q.id}" needs exactly four options`);
  });

  it('uses each id once', () => {
    const ids = [...ASSESSMENT.dimensions.map((d) => d.id), ...questions.map(({ q }) => q.id)];
    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], 'repeated ids');
  });

  it('builds every dimension on a framework that exists', () => {
    for (const d of ASSESSMENT.dimensions) {
      assert.ok(frameworkFiles.includes(d.framework), `"${d.name}" names framework "${d.framework}", but there's no src/content/frameworks/${d.framework}.md`);
    }
  });

  it('has four stages, starting at 0 and rising', () => {
    const mins = ASSESSMENT.stages.map((s) => s.minAverage);
    assert.deepEqual(ASSESSMENT.stages.map((s) => s.name), ['Magic', 'Alchemy', 'Chemistry', 'Boring']);
    assert.equal(mins[0], 0);
    for (let i = 1; i < mins.length; i++) assert.ok(mins[i] > mins[i - 1], `stage ${i + 1} must start above stage ${i}`);
    assert.ok(mins.at(-1) <= 3);
  });

  it('defines each stage in one sentence', () => {
    for (const s of ASSESSMENT.stages) {
      const sentences = s.definition.trim().split(/[.!?](?:\s+|$)/).filter(Boolean);
      assert.equal(sentences.length, 1, `the ${s.name} definition should be one sentence`);
    }
  });

  it('has sensible rules', () => {
    const { weakestLinkCap, gapCount } = ASSESSMENT.rules;
    assert.ok(weakestLinkCap === null || (Number.isInteger(weakestLinkCap) && weakestLinkCap >= 1));
    assert.ok(gapCount >= 1 && gapCount <= ASSESSMENT.dimensions.length);
  });
});

describe('words', () => {
  it('leaves no text empty, in either mode', () => {
    for (const { path, text } of ALL) assert.notEqual(text.trim(), '', `${path} is empty`);
  });

  it('only uses a mode-specific version where the two actually differ', () => {
    for (const { q } of questions) {
      for (const text of [q.prompt, q.nextStep, ...q.options]) {
        if (typeof text !== 'string') assert.notEqual(text.department, text.company, `question "${q.id}": both versions are the same`);
      }
    }
  });

  it('keeps questions and options short enough to read on a phone', () => {
    for (const { q } of questions) {
      for (const prompt of both(q.prompt)) assert.ok(prompt.length <= 120, `question "${q.id}": shorten the question`);
      q.options.forEach((option, i) => {
        for (const text of both(option)) assert.ok(text.length <= 150, `question "${q.id}", option ${i + 1}: shorten it (${text.length} characters)`);
      });
      for (const step of both(q.nextStep)) assert.ok(step.length <= 280, `question "${q.id}": shorten the next step (${step.length} characters)`);
    }
  });

  it('has no emoji', () => {
    for (const { path, text } of ALL) assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, `${path} has an emoji`);
  });

  it('stays plain: no hype words', () => {
    const hype = /\b(revolutioni[sz]e|game[- ]?chang|unlock|leverag|synerg|cutting[- ]edge|seamless|supercharg|transformative|world[- ]class|best[- ]in[- ]class|next[- ]gen|paradigm|disrupt|empower|holistic|journey|robust)/i;
    for (const { path, text } of ALL) assert.doesNotMatch(text, hype, path);
  });

  it('describes situations, not agree/disagree scales', () => {
    for (const { q } of questions) for (const option of q.options) for (const text of both(option)) assert.doesNotMatch(text, /\b(strongly )?(dis)?agree\b/i);
  });

  it('makes no comparison with other organizations', () => {
    const claims = /\bpercentile\b|\btop \d+ ?%|\d+ ?% of (companies|organi[sz]ations|teams|leaders)|better than (most|other)|ahead of (most|other|your peers)|compared (to|with) (most|other|your peers)/i;
    for (const { path, text } of ALL) assert.doesNotMatch(text, claims, path);
  });

  it('says plainly that the result is a self-reported snapshot, not a benchmark', () => {
    assert.match(ASSESSMENT.results.about.paragraphs.join(' '), /not a benchmark/);
    assert.match(ASSESSMENT.results.snapshot, /self-reported/i);
  });

  it('only uses placeholders the page knows how to fill', () => {
    const known = new Set(['n', 'total', 'points', 'max', 'average', 'uncapped', 'dimension', 'weakStage', 'steps', 'count', 'framework', 'play', 'date', 'questions', 'thresholds', 'stage', 'next', 'min']);
    for (const { path, text } of ALL) {
      for (const [, name] of text.matchAll(/\{(\w+)\}/g)) assert.ok(known.has(name), `${path} uses {${name}}, which the page doesn't fill`);
    }
  });

  it('keeps the placeholders each template needs', () => {
    const R = ASSESSMENT.results;
    const needs = [
      ['quiz.progress', ASSESSMENT.quiz.progress, ['n', 'total']],
      ['results.points', R.points, ['points', 'max', 'average']],
      ['results.capped', R.capped, ['uncapped', 'dimension', 'weakStage']],
      ['results.dimensionPoints', R.dimensionPoints, ['points', 'max']],
      ['results.gapTag', R.gapTag, ['n']],
      ['results.stamp', R.stamp, ['date']],
      ['results.gaps.heading.own', R.gaps.heading.own, ['count']],
      ['results.gaps.heading.shared', R.gaps.heading.shared, ['count']],
      ['results.gaps.read', R.gaps.read, ['framework']],
      ['results.gaps.play', R.gaps.play, ['play']],
      ['results.about.thresholdFirst', R.about.thresholdFirst, ['stage', 'next']],
      ['results.about.thresholdOther', R.about.thresholdOther, ['stage', 'min']],
    ];
    for (const [path, text, names] of needs) for (const name of names) assert.ok(text.includes(`{${name}}`), `${path} needs {${name}}`);
  });

  it('puts the emphasized word in the headline', () => {
    assert.ok(ASSESSMENT.intro.title.includes(ASSESSMENT.intro.emphasis));
  });
});
