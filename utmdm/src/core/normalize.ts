import { UTM_PARTS, type UtmPart, type UtmParts } from './model';

/*
 * Case and whitespace normalization, applied the same way to UTMs and to rule
 * text, so a rule written as "Summer Cup" matches "  SUMMER%20cup ".
 *
 * Deliberately conservative: "summer-cup" and "summer_cup" stay different.
 * Deciding they mean the same thing is a classification decision, and those
 * belong in rules, where they can be seen and versioned.
 */

const INVISIBLE = /[​‌‍⁠﻿]/g;
const ENCODED_SPACE = /%20|\+/gi; // how a URL writes a space; UTMs are URL parameters
const WHITESPACE = /\s+/g;

export const SEPARATOR = ' | ';

export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(ENCODED_SPACE, ' ')
    .toLowerCase()
    .replace(WHITESPACE, ' ')
    .trim();
}

export function normalizeParts(raw: Partial<Record<UtmPart, unknown>>): UtmParts {
  return Object.fromEntries(UTM_PARTS.map((part) => [part, normalizeText(raw[part])])) as UtmParts;
}

/** A UTM's identity: its normalized parts in a fixed order. */
export function utmKey(parts: UtmParts): string {
  return UTM_PARTS.map((part) => parts[part]).join(SEPARATOR);
}

/** A UTM as people read it: source / medium / campaign / content / term, empty tail dropped. */
export function displayUtm(parts: Partial<UtmParts>): string {
  const values = UTM_PARTS.map((part) => (parts[part] ?? '').trim());
  while (values.length && !values[values.length - 1]) values.pop();
  return values.join(' / ');
}

/** A value or a name as someone typed it, with stray spaces removed but its capitals kept. */
export function tidy(text: unknown): string {
  return String(text ?? '').normalize('NFKC').replace(INVISIBLE, '').replace(WHITESPACE, ' ').trim();
}
