import { describe, expect, it } from 'vitest';
import type { Ballot, Poll } from '../src/core/model';
import { tally } from '../src/core/tally';

function poll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: 'p',
    title: 'Movie night',
    method: 'rate',
    scale: 10,
    show: 'scores',
    choices: [
      { id: 'c1', label: 'Arrival' },
      { id: 'c2', label: 'Paddington 2', link: 'https://example.com/trailer' },
      { id: 'c3', label: 'Heat' },
    ],
    createdAt: 0,
    ...overrides,
  };
}

describe('tally: ratings', () => {
  it('adds up the ratings and averages them', () => {
    const ballots: Ballot[] = [
      { method: 'rate', ratings: { c1: 7, c2: 9, c3: 4 } },
      { method: 'rate', ratings: { c1: 8, c2: 8, c3: 4 } },
    ];
    const results = tally(poll(), ballots);
    expect(results.winners).toEqual(['c2']);
    expect(results.standings.map((s) => [s.label, s.place, s.score, s.average])).toEqual([
      ['Paddington 2', 1, 17, 8.5],
      ['Arrival', 2, 15, 7.5],
      ['Heat', 3, 8, 4],
    ]);
    expect(results.maxScore).toBe(20);
  });

  it('reports a tie as a tie, and the next place skips', () => {
    const results = tally(poll(), [{ method: 'rate', ratings: { c1: 5, c2: 5, c3: 2 } }]);
    expect(results.winners).toEqual(['c1', 'c2']);
    expect(results.standings.map((s) => s.place)).toEqual([1, 1, 3]);
    expect(results.maxScore).toBe(10);
  });

  it('keeps the link with the choice', () => {
    const results = tally(poll(), [{ method: 'rate', ratings: { c1: 1, c2: 9, c3: 2 } }]);
    expect(results.standings[0]).toMatchObject({ label: 'Paddington 2', link: 'https://example.com/trailer' });
  });
});

describe('tally: picks and rankings', () => {
  it('counts one point per pick', () => {
    const ballots: Ballot[] = [
      { method: 'pick', choice: 'c3' },
      { method: 'pick', choice: 'c3' },
      { method: 'pick', choice: 'c1' },
    ];
    const results = tally(poll({ method: 'pick' }), ballots);
    expect(results.winners).toEqual(['c3']);
    expect(results.standings.map((s) => [s.label, s.score])).toEqual([
      ['Heat', 2],
      ['Arrival', 1],
      ['Paddington 2', 0],
    ]);
    expect(results.standings[0]!.average).toBeUndefined();
  });

  it('gives n points for first place down to 1 for last (Borda)', () => {
    // Two people love Arrival and put Heat last; one hates Arrival. Paddington 2 is
    // everyone's second or first, and wins on breadth.
    const ballots: Ballot[] = [
      { method: 'rank', order: ['c1', 'c2', 'c3'] },
      { method: 'rank', order: ['c1', 'c2', 'c3'] },
      { method: 'rank', order: ['c2', 'c3', 'c1'] },
      { method: 'rank', order: ['c2', 'c3', 'c1'] },
    ];
    const results = tally(poll({ method: 'rank' }), ballots);
    expect(results.standings.map((s) => [s.label, s.score])).toEqual([
      ['Paddington 2', 10],
      ['Arrival', 8],
      ['Heat', 6],
    ]);
    expect(results.maxScore).toBe(12);
  });
});

describe('tally: what everyone sees', () => {
  const ballots: Ballot[] = [{ method: 'rate', ratings: { c1: 3, c2: 9, c3: 6 } }];

  it('drops the scores when the poll shows only the order', () => {
    const results = tally(poll({ show: 'order' }), ballots);
    expect(results.standings.map((s) => s.label)).toEqual(['Paddington 2', 'Heat', 'Arrival']);
    expect(results.standings.every((s) => s.score === undefined && s.average === undefined)).toBe(true);
    expect(results.maxScore).toBeUndefined();
  });

  it('keeps only the winner when the poll shows just the winner', () => {
    const results = tally(poll({ show: 'winner' }), ballots);
    expect(results.standings).toEqual([{ choiceId: 'c2', label: 'Paddington 2', link: 'https://example.com/trailer', place: 1 }]);
  });

  it('has no winner without ballots', () => {
    expect(tally(poll(), []).winners).toEqual([]);
  });
});
