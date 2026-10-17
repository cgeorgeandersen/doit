/**
 * The decorations show through October and on November 1, in the visitor's
 * own time zone, and stay off the rest of the year. Left in the code, they
 * come back by themselves each October.
 */
export function isHalloweenSeason(now: Date): boolean {
  const month = now.getMonth();
  return month === 9 || (month === 10 && now.getDate() === 1);
}
