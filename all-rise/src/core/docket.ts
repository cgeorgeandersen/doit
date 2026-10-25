import type { Ruling } from './sentence';
import type { Case } from './types';

export const DOCKET_SIZE = 6;

/**
 * Picks a day's cases: two silly, two serious and two of anything, with cases
 * the player hasn't seen first. It opens on a silly one to warm up and
 * alternates from there, so two heavy cases never come back to back unless
 * the pool runs out.
 */
export function pickDocket(pool: Case[], seen: ReadonlySet<string>, random: () => number = Math.random): Case[] {
  const fresh = (cases: Case[]) => {
    const shuffled = shuffle(cases, random);
    return [...shuffled.filter((c) => !seen.has(c.id)), ...shuffled.filter((c) => seen.has(c.id))];
  };
  const silly = fresh(pool.filter((c) => c.tone === 'silly'));
  const serious = fresh(pool.filter((c) => c.tone === 'serious'));
  const docket: Case[] = [];
  const take = (from: Case[]) => {
    const next = from.find((c) => !docket.includes(c));
    if (next) docket.push(next);
  };
  // Silly, serious, anything, silly, serious, anything.
  const rest = () => fresh(pool.filter((c) => !docket.includes(c) && c.tone !== docket.at(-1)?.tone));
  for (let i = 0; docket.length < Math.min(DOCKET_SIZE, pool.length); i++) {
    const before = docket.length;
    if (i % 3 === 0) take(silly);
    else if (i % 3 === 1) take(serious);
    else take(rest());
    if (docket.length === before) take(fresh(pool));
  }
  return docket;
}

export interface Career {
  title: string;
  blurb: string;
  justice: number;
  crowd: number;
  overturned: number;
}

export function career(rulings: Ruling[]): Career {
  const n = Math.max(1, rulings.length);
  const justice = Math.round(rulings.reduce((sum, r) => sum + r.justice, 0) / n);
  const crowd = Math.round(rulings.reduce((sum, r) => sum + r.crowd, 0) / n);
  const lean = rulings.reduce((sum, r) => sum + r.lean, 0) / n;
  const overturned = rulings.filter((r) => r.band === 'absurd').length;
  const base = { justice, crowd, overturned };

  if (overturned >= 2)
    return { ...base, title: 'Overturned Again', blurb: 'The appeals court has your photo on a dartboard. They are very good at darts now.' };
  if (justice >= 85 && crowd >= 70)
    return { ...base, title: 'Solomon With a Gavel', blurb: 'Fair, and somehow popular too. The appeals court sends you a fruit basket every Christmas.' };
  if (justice >= 85)
    return { ...base, title: 'The Even Hand', blurb: "Fair, if not always popular. History will like you more than the gallery did." };
  if (lean >= 1)
    return { ...base, title: 'The Iron Gavel', blurb: 'Defense lawyers cross the street when they see you. So do some prosecutors.' };
  if (lean <= -1)
    return { ...base, title: 'The Velvet Gavel', blurb: 'Everyone leaves your courtroom with a second chance and, occasionally, a goose.' };
  if (crowd >= 75)
    return { ...base, title: "The People's Judge", blurb: 'The gallery adores you. Law professors are writing a strongly worded article.' };
  return { ...base, title: 'The Wildcard', blurb: 'Nobody can predict you, including you. Lawyers bring snacks; it could be a long day.' };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
