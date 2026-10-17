import { describe, expect, it } from 'vitest';
import { checkBallot, checkNewPoll, normalizeLink, type Poll } from '../src/core/model';

const valid = {
  title: '  Friday   movie night ',
  method: 'rate',
  scale: 10,
  show: 'scores',
  choices: [{ label: 'Arrival', link: 'youtube.com/watch?v=tFMo3UJ4B4g' }, { label: 'Heat' }, { label: '' }],
  voters: ['George', ' Sam ', ''],
};

describe('checkNewPoll', () => {
  it('tidies the poll and drops empty rows', () => {
    const checked = checkNewPoll(valid);
    expect(checked).toEqual({
      ok: true,
      poll: {
        title: 'Friday movie night',
        method: 'rate',
        scale: 10,
        show: 'scores',
        choices: [{ label: 'Arrival', link: 'https://youtube.com/watch?v=tFMo3UJ4B4g' }, { label: 'Heat' }],
        voters: ['George', 'Sam'],
      },
    });
  });

  it.each([
    [{ title: '' }, 'Say what you’re deciding.'],
    [{ scale: 7 }, 'Ratings go from 1 to 5 or 1 to 10.'],
    [{ choices: [{ label: 'Arrival' }] }, 'Add at least 2 choices.'],
    [{ choices: [{ label: 'Heat' }, { label: 'heat' }] }, '“heat” is on the list twice.'],
    [{ choices: [{ label: 'Heat', link: 'javascript:alert(1)' }, { label: 'Up' }] }, 'The link for “Heat” isn’t a web address.'],
    [{ voters: ['George'] }, 'Add at least 2 people, including you.'],
    [{ voters: ['Sam', 'sam'] }, 'sam is already on the list.'],
  ])('rejects %o', (change, error) => {
    expect(checkNewPoll({ ...valid, ...change })).toEqual({ ok: false, error });
  });

  it('ignores the scale unless people rate', () => {
    const checked = checkNewPoll({ ...valid, method: 'pick', scale: 7 });
    expect(checked.ok).toBe(true);
    expect(checked.ok && checked.poll.scale).toBeUndefined();
  });
});

describe('checkBallot', () => {
  const poll: Poll = {
    id: 'p',
    title: 't',
    method: 'rate',
    scale: 5,
    show: 'scores',
    choices: [
      { id: 'c1', label: 'A' },
      { id: 'c2', label: 'B' },
    ],
    createdAt: 0,
  };

  it('needs a whole-number rating in range for every choice', () => {
    expect(checkBallot(poll, { method: 'rate', ratings: { c1: 5, c2: 1 } })).toBeNull();
    expect(checkBallot(poll, { method: 'rate', ratings: { c1: 5 } })).toBe('Rate every choice.');
    expect(checkBallot(poll, { method: 'rate', ratings: { c1: 6, c2: 1 } })).toBe('Ratings go from 1 to 5.');
    expect(checkBallot(poll, { method: 'rate', ratings: { c1: 2.5, c2: 1 } })).toBe('Ratings go from 1 to 5.');
    expect(checkBallot(poll, { method: 'rate', ratings: { c1: 1, c2: 1, c9: 1 } })).toMatch(/isn’t in this poll/);
  });

  it('needs one real choice for a pick, and every choice once for a ranking', () => {
    expect(checkBallot({ ...poll, method: 'pick' }, { method: 'pick', choice: 'c2' })).toBeNull();
    expect(checkBallot({ ...poll, method: 'pick' }, { method: 'pick', choice: 'c9' })).toBe('Pick one choice.');
    expect(checkBallot({ ...poll, method: 'rank' }, { method: 'rank', order: ['c2', 'c1'] })).toBeNull();
    expect(checkBallot({ ...poll, method: 'rank' }, { method: 'rank', order: ['c2', 'c2'] })).toBe('Put every choice in order.');
  });

  it('rejects a ballot for a different kind of poll', () => {
    expect(checkBallot(poll, { method: 'pick', choice: 'c1' })).toBe('This vote is for a different kind of poll.');
  });
});

describe('normalizeLink', () => {
  it('adds https:// to a bare address and leaves full links alone', () => {
    expect(normalizeLink(' example.com/a ')).toBe('https://example.com/a');
    expect(normalizeLink('http://example.com')).toBe('http://example.com');
    expect(normalizeLink('')).toBe('');
  });
});
