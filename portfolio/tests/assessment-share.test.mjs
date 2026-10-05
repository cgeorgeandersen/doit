/** Share links (src/assessment/share.ts): a result lives after the # of its address. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodeSnapshot, encodeSnapshot, resultUrl, sameAnswers } from '../src/assessment/share.ts';

const EXPECTED = { version: 1, questions: 18 };
const answers = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1];

describe('share links', () => {
  it('round-trips a department result with its date', () => {
    const snapshot = { mode: 'department', answers, date: '2026-10-05' };
    const hash = encodeSnapshot(snapshot, 1);
    assert.equal(hash, 'v=1&m=d&a=012301230123012301&t=2026-10-05');
    assert.deepEqual(decodeSnapshot(`#${hash}`, EXPECTED), { ok: true, snapshot });
  });

  it('round-trips a company result without a date', () => {
    const snapshot = { mode: 'company', answers: answers.map(() => 3), date: null };
    const hash = encodeSnapshot(snapshot, 1);
    assert.equal(hash, 'v=1&m=c&a=333333333333333333');
    assert.deepEqual(decodeSnapshot(hash, EXPECTED), { ok: true, snapshot });
  });

  it('builds the full address from the results page', () => {
    const url = resultUrl('https://www.georgeandersen.net/tools/how-boring-is-your-ai/results', { mode: 'company', answers, date: null }, 1);
    assert.equal(url, 'https://www.georgeandersen.net/tools/how-boring-is-your-ai/results#v=1&m=c&a=012301230123012301');
  });

  it('carries nothing but the version, mode, answers and date', () => {
    const hash = encodeSnapshot({ mode: 'department', answers, date: '2026-10-05' }, 1);
    assert.deepEqual([...new URLSearchParams(hash).keys()], ['v', 'm', 'a', 't']);
  });

  it('reports an address with no result as empty', () => {
    for (const hash of ['', '#', '#utm_source=linkedin']) assert.deepEqual(decodeSnapshot(hash, EXPECTED), { ok: false, reason: 'empty' }, hash);
  });

  it('recognizes a link from an earlier question set', () => {
    assert.deepEqual(decodeSnapshot('#v=1&m=d&a=012301230123012301', { version: 2, questions: 18 }), { ok: false, reason: 'old' });
  });

  it('rejects damaged links', () => {
    const broken = [
      '#v=1&m=d&a=01230123012301230', // cut off: 17 answers
      '#v=1&m=d&a=0123012301230123011', // 19 answers
      '#v=1&m=d&a=012301230123012304', // a 4
      '#v=1&m=d&a=01230123012301230x',
      '#v=1&m=x&a=012301230123012301', // unknown mode
      '#v=1&a=012301230123012301', // no mode
      '#v=1&m=d', // no answers
      '#m=d&a=012301230123012301', // no version
      '#v=9&m=d&a=012301230123012301', // a version from the future
      '#v=one&m=d&a=012301230123012301',
    ];
    for (const hash of broken) assert.deepEqual(decodeSnapshot(hash, EXPECTED), { ok: false, reason: 'broken' }, hash);
  });

  it('keeps the result when only the date is damaged', () => {
    for (const t of ['2026-13-01', '2026-02-30', 'yesterday', '']) {
      const decoded = decodeSnapshot(`#v=1&m=d&a=012301230123012301&t=${t}`, EXPECTED);
      assert.equal(decoded.ok, true, t);
      assert.equal(decoded.snapshot.date, null, t);
      assert.deepEqual(decoded.snapshot.answers, answers);
    }
  });

  it('ignores extra parameters, such as tracking tags added by a social site', () => {
    assert.equal(decodeSnapshot('#v=1&m=d&a=012301230123012301&fbclid=abc', EXPECTED).ok, true);
  });

  it('compares snapshots by mode and answers', () => {
    const a = { mode: 'department', answers, date: '2026-10-05' };
    assert.equal(sameAnswers(a, { ...a, date: null }), true);
    assert.equal(sameAnswers(a, { ...a, mode: 'company' }), false);
    assert.equal(sameAnswers(a, { ...a, answers: [...answers.slice(1), 3] }), false);
  });
});
