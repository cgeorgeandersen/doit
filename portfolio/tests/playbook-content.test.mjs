/**
 * Checks on src/playbook/content.ts: it stays in step with the assessment,
 * still reads in the time its kicker promises, and keeps the site's plain
 * tone. Each failure says what to fix.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { ASSESSMENT } from '../src/assessment/content.ts';
import { SITE } from '../src/config/site.ts';
import { PLAYBOOK } from '../src/playbook/content.ts';

const FRAMEWORKS = resolve(import.meta.dirname, '../src/content/frameworks');
const frameworkFiles = readdirSync(FRAMEWORKS)
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.slice(0, -3));
const titleOf = (id) => readFileSync(resolve(FRAMEWORKS, `${id}.md`), 'utf8').match(/^title:\s*"(.+)"\s*$/m)?.[1] ?? '';

/** Every string in the content, with where it is, minus the keys that are never shown as words. */
const HIDDEN = new Set(['meta', 'dimension', 'question', 'framework', 'kind', 'updated', 'printOnly']);
function strings(value, path = 'PLAYBOOK', skip = HIDDEN) {
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`, skip));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => (skip.has(k) ? [] : strings(v, `${path}.${k}`, skip)));
  }
  return [];
}

const ALL = strings(PLAYBOOK, 'PLAYBOOK', new Set());
const SHOWN = strings(PLAYBOOK);
const words = (text) => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
const playFrameworks = PLAYBOOK.plays.map((play) => ASSESSMENT.dimensions.find((d) => d.id === play.dimension)?.framework);

describe('in step with the assessment', () => {
  it('has one play per dimension, in the same order', () => {
    assert.deepEqual(
      PLAYBOOK.plays.map((p) => p.dimension),
      ASSESSMENT.dimensions.map((d) => d.id),
      'the plays must follow the assessment’s dimensions one to one, in order (see the top of src/playbook/content.ts)',
    );
  });

  it('gives one "working" sign per question, in the assessment’s order', () => {
    for (const play of PLAYBOOK.plays) {
      const dimension = ASSESSMENT.dimensions.find((d) => d.id === play.dimension);
      assert.deepEqual(
        play.working.map((s) => s.question),
        dimension.questions.map((q) => q.id),
        `play "${play.title}": "working" needs one sign for each of ${dimension.questions.map((q) => `"${q.id}"`).join(', ')}, in that order`,
      );
    }
  });

  it('names frameworks that exist', () => {
    for (const rule of PLAYBOOK.guardrails.rules) {
      assert.ok(frameworkFiles.includes(rule.framework), `a guardrail names "${rule.framework}", but there's no src/content/frameworks/${rule.framework}.md`);
    }
    assert.ok(frameworkFiles.includes(PLAYBOOK.champions.framework), `the champion network names "${PLAYBOOK.champions.framework}", which doesn't exist`);
  });
});

describe('shape', () => {
  it('keeps every play the same shape, so the two printed pages hold', () => {
    for (const play of PLAYBOOK.plays) {
      assert.ok(play.notYet.length >= 1 && play.notYet.length <= 3, `play "${play.title}": one to three "not yet" signs`);
      assert.ok(play.bridge.length >= 1 && play.bridge.length <= 3, `play "${play.title}": one to three moves to bridge the gap`);
      if (play.figure.kind === 'steps') assert.ok(play.figure.steps.length >= 2 && play.figure.steps.length <= 5, `play "${play.title}": two to five steps in the figure`);
      if (play.figure.kind === 'grid') {
        for (const row of play.figure.rows) assert.equal(row.cells.length, play.figure.columns.length, `play "${play.title}": row "${row.name}" needs one cell per column`);
        assert.ok(play.figure.columns.length <= 3, `play "${play.title}": at most three columns fit a play's width`);
      }
    }
  });

  it('keeps lines short enough for a play’s narrow column', () => {
    for (const play of PLAYBOOK.plays) {
      assert.ok(play.title.length <= 28, `play "${play.title}": shorten the title`);
      assert.ok(play.model.length <= 60, `play "${play.title}": shorten the line to remember (${play.model.length} characters)`);
      assert.ok((play.why ?? "").length <= 110, `play "${play.title}": shorten "why" (${play.why?.length} characters)`);
      for (const text of [...play.working.map((s) => s.text), ...play.notYet, ...play.bridge]) {
        assert.ok(text.length <= 125, `play "${play.title}": shorten "${text.slice(0, 40)}…" (${text.length} characters)`);
      }
    }
  });

  it('explains itself to someone who has never seen the site', () => {
    assert.ok(PLAYBOOK.boring.text.length > 0 && PLAYBOOK.boring.points.length === 4, 'say what "boring" means, in four points');
    assert.ok(PLAYBOOK.start.steps.length >= 3 && PLAYBOOK.start.steps.length <= 6, 'the starting plan needs three to six steps');
    for (const step of PLAYBOOK.start.steps) assert.ok(step.owner.trim() && step.when.trim(), `"${step.text.slice(0, 30)}…" needs a time and an owner`);
    // Words that only make sense after reading the rest of the site.
    const insider = /\b(centaur|holdout|passenger|alchemy|chemistry|reverse centaur|trust map)\b/i;
    for (const { path, text } of SHOWN) assert.doesNotMatch(text, insider, `${path} uses a term from the site that a new reader won't know`);
  });

  it('puts the emphasized word in the headline', () => {
    assert.ok(PLAYBOOK.intro.title.includes(PLAYBOOK.intro.emphasis));
  });
});

describe('words', () => {
  it('reads in the time its kicker promises', (t) => {
    const promised = Number(PLAYBOOK.intro.kicker.join(' ').match(/(\d+)-minute read/)?.[1]);
    assert.ok(promised > 0, 'the kicker should say how long it takes to read, like "5-minute read"');
    // What the page shows: the content, the labels repeated in every play, and the stage and framework names.
    const labels = strings(PLAYBOOK.labels).reduce((n, s) => n + words(s.text), 0);
    // Framework names appear once, in the footer.
    const names = [...new Set([...playFrameworks, ...PLAYBOOK.guardrails.rules.map((r) => r.framework), PLAYBOOK.champions.framework])].map(titleOf);
    // Plus what the page adds around them: play and step numbers, "Owner:" on each step, the byline, the address and the month in the footer. "Play {n}" is for screen readers only.
    const steps = PLAYBOOK.start.steps.length;
    const around = PLAYBOOK.plays.length + steps * 2 + words(SITE.name) + 2 + 3 - words(PLAYBOOK.labels.play) * PLAYBOOK.plays.length;
    const total =
      SHOWN.reduce((n, s) => n + words(s.text), 0) + labels * (PLAYBOOK.plays.length - 1) + names.reduce((n, name) => n + words(name), 0) + around;
    // 238 words a minute: the average for reading non-fiction silently (Brysbaert, 2019).
    const minutes = total / 238;
    t.diagnostic(`about ${total} words: ${minutes.toFixed(1)} minutes at 238 words a minute`);
    assert.ok(minutes <= promised, `about ${total} words takes ${minutes.toFixed(1)} minutes to read; the kicker promises ${promised}. Cut some words, or change the kicker.`);
  });

  it('leaves no text empty', () => {
    for (const { path, text } of ALL) assert.notEqual(text.trim(), '', `${path} is empty`);
  });

  it('has no emoji', () => {
    for (const { path, text } of ALL) assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, `${path} has an emoji`);
  });

  it('stays plain: no hype words', () => {
    const hype = /\b(revolutioni[sz]e|game[- ]?chang|unlock|leverag|synerg|cutting[- ]edge|seamless|supercharg|transformative|world[- ]class|best[- ]in[- ]class|next[- ]gen|paradigm|disrupt|empower|holistic|journey|robust)/i;
    for (const { path, text } of ALL) assert.doesNotMatch(text, hype, path);
  });

  it('only uses placeholders the page knows how to fill', () => {
    const known = new Set(['n', 'date']);
    for (const { path, text } of ALL) {
      for (const [, name] of text.matchAll(/\{(\w+)\}/g)) assert.ok(known.has(name), `${path} uses {${name}}, which the page doesn't fill`);
    }
  });

  it('dates the playbook with a real calendar day', () => {
    assert.match(PLAYBOOK.updated, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(new Date(PLAYBOOK.updated).getTime()));
  });
});
