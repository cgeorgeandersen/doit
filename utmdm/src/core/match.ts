import { MATCH_TYPES, type MatchType } from './model';
import { normalizeText } from './normalize';

export type Predicate = (text: string) => boolean;

export class InvalidRule extends Error {
  override name = 'InvalidRule';
}

// A regex that matches every one of these matches anything: a catch-all in
// disguise (".*", "a*", "|"). One that matches only some, like "^$", is fine.
const CATCH_ALL_PROBES = ['', 'q', 'zz9 | yy-x | w_v'];

/**
 * A rule's pattern as a test on normalized text. contains, exact and
 * starts_with normalize the pattern like any UTM. regex is used as written,
 * case-insensitive, and searches anywhere (anchor with ^ and $). Lowercasing a
 * regex would change it: \D (not a digit) would become \d (a digit).
 */
export function compilePattern(match: MatchType, pattern: string): Predicate {
  if (!MATCH_TYPES.includes(match)) throw new InvalidRule(`Unknown match type "${match}"`);
  if (match === 'regex') {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'i');
    } catch (error) {
      throw new InvalidRule(`That regex doesn't parse: ${(error as Error).message}`);
    }
    if (CATCH_ALL_PROBES.every((probe) => regex.test(probe))) {
      throw new InvalidRule('That regex matches anything, so it would act as a catch-all. Make it more specific.');
    }
    return (text) => regex.test(text);
  }
  const needle = normalizeText(pattern);
  if (!needle) throw new InvalidRule('The pattern is empty.');
  if (match === 'contains') return (text) => text.includes(needle);
  if (match === 'exact') return (text) => text === needle;
  return (text) => text.startsWith(needle);
}
