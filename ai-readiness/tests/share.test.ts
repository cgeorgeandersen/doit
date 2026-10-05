import { describe, expect, it } from 'vitest';
import { decodeSnapshot, encodeSnapshot, resultUrl, sameAnswers, type Snapshot } from '../src/lib/share.ts';

const EXPECTED = { version: 1, questions: 18 };
const answers = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1];

describe('share links', () => {
  it('round-trips a department result with its date', () => {
    const snapshot: Snapshot = { mode: 'department', answers, date: '2026-10-05' };
    const hash = encodeSnapshot(snapshot, 1);
    expect(hash).toBe('v=1&m=d&a=012301230123012301&t=2026-10-05');
    expect(decodeSnapshot(`#${hash}`, EXPECTED)).toEqual({ ok: true, snapshot });
  });

  it('round-trips a company result without a date', () => {
    const snapshot: Snapshot = { mode: 'company', answers: answers.map(() => 3), date: null };
    const hash = encodeSnapshot(snapshot, 1);
    expect(hash).toBe('v=1&m=c&a=333333333333333333');
    expect(decodeSnapshot(hash, EXPECTED)).toEqual({ ok: true, snapshot });
  });

  it('builds the full address under /results', () => {
    const url = resultUrl('https://example.com', { mode: 'company', answers, date: null }, 1);
    expect(url).toBe('https://example.com/results#v=1&m=c&a=012301230123012301');
  });

  it('carries nothing but the version, mode, answers and date', () => {
    const hash = encodeSnapshot({ mode: 'department', answers, date: '2026-10-05' }, 1);
    expect([...new URLSearchParams(hash).keys()]).toEqual(['v', 'm', 'a', 't']);
  });

  it('reports an address with no result as empty', () => {
    expect(decodeSnapshot('', EXPECTED)).toEqual({ ok: false, reason: 'empty' });
    expect(decodeSnapshot('#', EXPECTED)).toEqual({ ok: false, reason: 'empty' });
    expect(decodeSnapshot('#utm_source=linkedin', EXPECTED)).toEqual({ ok: false, reason: 'empty' });
  });

  it('recognizes a link from an earlier question set', () => {
    expect(decodeSnapshot('#v=1&m=d&a=012301230123012301', { version: 2, questions: 18 })).toEqual({ ok: false, reason: 'old' });
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
    for (const hash of broken) expect(decodeSnapshot(hash, EXPECTED), hash).toEqual({ ok: false, reason: 'broken' });
  });

  it('keeps the result when only the date is damaged', () => {
    for (const t of ['2026-13-01', '2026-02-30', 'yesterday', '']) {
      const decoded = decodeSnapshot(`#v=1&m=d&a=012301230123012301&t=${t}`, EXPECTED);
      expect(decoded.ok && decoded.snapshot.date, t).toBeNull();
      expect(decoded.ok && decoded.snapshot.answers).toEqual(answers);
    }
  });

  it('ignores extra parameters, such as tracking tags added by a social site', () => {
    const decoded = decodeSnapshot('#v=1&m=d&a=012301230123012301&fbclid=abc', EXPECTED);
    expect(decoded.ok).toBe(true);
  });

  it('compares snapshots by mode and answers', () => {
    const a: Snapshot = { mode: 'department', answers, date: '2026-10-05' };
    expect(sameAnswers(a, { ...a, date: null })).toBe(true);
    expect(sameAnswers(a, { ...a, mode: 'company' })).toBe(false);
    expect(sameAnswers(a, { ...a, answers: [...answers.slice(1), 3] })).toBe(false);
  });
});
