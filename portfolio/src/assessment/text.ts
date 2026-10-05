/**
 * Small text helpers for the assessment's words, shared by the page and the
 * tests. Quotes are curled with the site's own typeset().
 */
import { typeset } from '../lib/typeset.ts';

/**
 * Fills {placeholders} in a piece of copy: fill('Question {n} of {total}', { n: 4, total: 18 }).
 * A placeholder with no value is left as it is, so a typo shows on the page instead of vanishing.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/** Copy as the reader sees it: placeholders filled, quotes curled. */
export function tx(template: string, values: Record<string, string | number> = {}): string {
  return typeset(fill(template, values));
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** "three" for 3; numbers past ten stay digits. */
export function numberWord(n: number): string {
  return WORDS[n] ?? String(n);
}

/** "one step", "two steps". */
export function steps(n: number): string {
  return `${numberWord(n)} step${n === 1 ? '' : 's'}`;
}

/** 2.1666… → "2.2"; 3 → "3". */
export function oneDecimal(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Today's calendar date where the reader is, as "2026-10-05". */
export function localIsoDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "2026-10-05" → "Oct 5, 2026", the portfolio's date style (UTC, so it never shifts a day). */
export function formatDate(iso: string, locale = 'en-US'): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}
