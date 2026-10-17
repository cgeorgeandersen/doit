import type { Ballot, Poll, Results, Standing } from './model.js';

/**
 * Turns the ballots into results.
 *
 * - rate: each choice's score is the sum of its ratings. Everyone rates every
 *   choice, so the sum and the average put the choices in the same order.
 * - pick: one point per ballot that picked it.
 * - rank: a Borda count. With n choices, first place on a ballot is worth n
 *   points and last place 1, so a choice everyone ranks second can beat one
 *   half the group loves and half ranks last.
 *
 * Equal scores share a place, so a tie is reported as a tie, never broken by
 * the order the choices were typed in. What's returned depends on `poll.show`:
 * scores are dropped unless the poll shows them, and only the winners are kept
 * when it shows just the winner.
 */
export function tally(poll: Poll, ballots: Ballot[]): Results {
  const n = poll.choices.length;
  const scores = new Map(poll.choices.map((c) => [c.id, 0]));
  const add = (id: string, points: number) => {
    if (scores.has(id)) scores.set(id, (scores.get(id) ?? 0) + points);
  };

  for (const ballot of ballots) {
    if (ballot.method !== poll.method) continue;
    if (ballot.method === 'rate') for (const [id, rating] of Object.entries(ballot.ratings)) add(id, rating);
    else if (ballot.method === 'pick') add(ballot.choice, 1);
    else ballot.order.forEach((id, position) => add(id, n - position));
  }

  const counted = ballots.filter((b) => b.method === poll.method).length;
  const ordered = poll.choices
    .map((choice, index) => ({ choice, index, score: scores.get(choice.id) ?? 0 }))
    // Highest first; equal scores keep the order the choices were listed in.
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const standings: Standing[] = [];
  ordered.forEach((entry, i) => {
    const previous = ordered[i - 1];
    const place = previous && previous.score === entry.score ? standings[i - 1]!.place : i + 1;
    standings.push({
      choiceId: entry.choice.id,
      label: entry.choice.label,
      ...(entry.choice.link ? { link: entry.choice.link } : {}),
      place,
      score: entry.score,
      ...(poll.method === 'rate' && counted > 0 ? { average: round1(entry.score / counted) } : {}),
    });
  });

  const winners = counted > 0 ? standings.filter((s) => s.place === 1).map((s) => s.choiceId) : [];
  const maxScore = poll.method === 'rate' ? counted * poll.scale : poll.method === 'pick' ? counted : counted * n;

  if (poll.show === 'scores') return { ballots: counted, winners, standings, maxScore };
  const withoutScores = standings.map(({ score: _score, average: _average, ...rest }) => rest);
  if (poll.show === 'order') return { ballots: counted, winners, standings: withoutScores };
  return { ballots: counted, winners, standings: withoutScores.filter((s) => winners.includes(s.choiceId)) };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
