import type { Results } from './classify';
import type { Field, Utm, Workspace } from './model';

/*
 * Suggestions for an outstanding UTM: which value it most likely means. Three
 * kinds of evidence, best score wins:
 *   - UTMs already classified whose same part looks alike ("sc-26" ≈ "sc26_promo");
 *   - the value's own name ("witer warmup" ≈ "Winter Warmup 2026");
 *   - initials: a short word that spells a value's initials ("sr" = Spring Refresh).
 * Numbers are ignored: "26" is in every 2026 campaign, so it says nothing about which one.
 * A suggestion is only a suggestion. Accepting one writes a rule.
 */

export interface Suggestion {
  value: string;
  score: number; // 0–100
  reason: string;
}

const LETTER_DIGIT = /(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/g;
const SEPARATORS = /[\s_\-.+/|%]+/;
const INITIALS_SCORE = 95;

/** Words only, numbers dropped: "SC26_Promo" and "sc promo 2026" compare equal. */
export function comparable(text: string): string {
  return text
    .toLowerCase()
    .replace(LETTER_DIGIT, ' ')
    .split(SEPARATORS)
    .filter((word) => word && !/^\d+$/.test(word))
    .join(' ');
}

export function initials(name: string): Set<string> {
  const words = comparable(name).split(' ').filter(Boolean);
  if (words.length < 2) return new Set();
  const first = (list: string[]) => list.map((w) => w[0]).join('');
  return new Set([first(words), first(words.slice(0, 2)), first(words.slice(-2))]);
}

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}

function ratio(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  return longest ? 100 * (1 - levenshtein(a, b) / longest) : 100;
}

/** How alike two comparable strings are, 0–100, allowing one to sit inside the other. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const sorted = (s: string) => s.split(' ').sort().join(' ');
  let best = Math.max(ratio(a, b), ratio(sorted(a), sorted(b)));
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 2 && long.length / short.length >= 1.5) {
    let partial = 0;
    for (let i = 0; i + short.length <= long.length; i++) {
      partial = Math.max(partial, ratio(short, long.slice(i, i + short.length)));
      if (partial === 100) break;
    }
    best = Math.max(best, partial * 0.9);
  }
  return Math.round(best);
}

export function suggest(utm: Utm, field: Field, ws: Workspace, results: Results, { limit = 3, cutoff = 70 } = {}): Suggestion[] {
  const query = comparable(utm.parts[field.target]);
  if (!query) return [];
  const best = new Map<string, Suggestion>();
  const offer = (value: string, score: number, reason: string) => {
    if (score >= cutoff && score > (best.get(value)?.score ?? -1)) best.set(value, { value, score, reason });
  };

  const seen = new Set<string>();
  for (const other of ws.utms) {
    const outcome = results.get(other.key)?.[field.id];
    if (other.key === utm.key || outcome?.status !== 'classified' || !outcome.value) continue;
    const text = comparable(other.parts[field.target]);
    if (!text || seen.has(`${text}|${outcome.value}`)) continue;
    seen.add(`${text}|${outcome.value}`);
    offer(outcome.value, similarity(query, text), `looks like "${other.parts[field.target]}", already ${outcome.value}`);
  }

  const words = new Set(query.split(' ').filter((w) => /^[a-z]{2,4}$/.test(w)));
  for (const value of field.values) {
    offer(value, similarity(query, comparable(value)), "looks like the value's name");
    const hit = [...initials(value)].find((abbreviation) => words.has(abbreviation));
    if (hit) offer(value, INITIALS_SCORE, `"${hit}" spells its initials`);
  }

  return [...best.values()].sort((a, b) => b.score - a.score || a.value.localeCompare(b.value)).slice(0, limit);
}
