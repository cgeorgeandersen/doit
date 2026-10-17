import { describe, expect, it } from 'vitest';
import { isHalloweenSeason } from '../src/seasonal/halloween/season';

describe('isHalloweenSeason', () => {
  it('is on through October and on November 1', () => {
    expect(isHalloweenSeason(new Date(2026, 9, 1))).toBe(true);
    expect(isHalloweenSeason(new Date(2026, 9, 31, 23, 59))).toBe(true);
    expect(isHalloweenSeason(new Date(2026, 10, 1, 22))).toBe(true);
  });

  it('is off the rest of the year', () => {
    expect(isHalloweenSeason(new Date(2026, 8, 30, 23, 59))).toBe(false);
    expect(isHalloweenSeason(new Date(2026, 10, 2))).toBe(false);
    expect(isHalloweenSeason(new Date(2027, 3, 15))).toBe(false);
  });
});
