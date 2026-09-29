/**
 * Dates in frontmatter are calendar days ("2026-09-29"), which parse as
 * midnight UTC. Everything here works in UTC so a date never shows up as the
 * day before for readers (or builds) in the Americas.
 */
import { SITE } from '../config/site';

const DAY_MS = 86_400_000;

/** "Sep 29, 2026" */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(SITE.locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}

/** "Sep 2026" */
export function formatMonth(date: Date): string {
  return new Intl.DateTimeFormat(SITE.locale, { year: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

/** "2026-09-29", for <time datetime> and data attributes. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function year(date: Date): number {
  return date.getUTCFullYear();
}

export function daysSince(date: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - date.getTime()) / DAY_MS);
}

/** True once a review date is older than the window in site.ts (180 days). */
export function isDueForReview(reviewed: Date, now: Date = new Date()): boolean {
  return daysSince(reviewed, now) > SITE.review.staleAfterDays;
}
