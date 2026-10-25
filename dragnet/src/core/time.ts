/**
 * Simulation time is minutes since midnight on day 0. Day 0 is Wednesday,
 * September 23, 2026; the shift happens on day 30, Friday, October 23. The
 * database holds the 30 days before it, the way a plate reader system with a
 * 30-day retention setting would.
 */

export const MIN_PER_DAY = 1440;
export const TODAY = 30;
export const HISTORY_DAYS = 30;
/** Day 0's weekday, 0 = Sunday. */
const DAY0_WEEKDAY = 3;
const DAY0 = Date.UTC(2026, 8, 23);

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function at(day: number, hour: number, minute = 0): number {
  return day * MIN_PER_DAY + hour * 60 + minute;
}

export function dayOf(t: number): number {
  return Math.floor(t / MIN_PER_DAY);
}

export function minuteOfDay(t: number): number {
  return t - dayOf(t) * MIN_PER_DAY;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(day: number): number {
  return (((day + DAY0_WEEKDAY) % 7) + 7) % 7;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "14:02" */
export function fmtTime(t: number): string {
  const m = Math.floor(minuteOfDay(t));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "14:02:37" */
export function fmtClock(t: number): string {
  const m = minuteOfDay(t);
  const whole = Math.floor(m);
  const s = Math.floor((m - whole) * 60);
  return `${pad(Math.floor(whole / 60))}:${pad(whole % 60)}:${pad(s)}`;
}

function calendar(day: number): Date {
  return new Date(DAY0 + day * 86400000);
}

/** "Fri Oct 23" */
export function fmtDate(day: number): string {
  const d = calendar(day);
  return `${WEEKDAYS[weekday(day)]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Friday" */
export function fmtWeekday(day: number): string {
  return WEEKDAYS_LONG[weekday(day)] as string;
}

/** "Fri Oct 23 14:02" */
export function fmtDateTime(t: number): string {
  return `${fmtDate(dayOf(t))} ${fmtTime(t)}`;
}

/** "2026-10-23 14:02:37", for camera overlays. */
export function fmtStamp(t: number): string {
  const d = calendar(dayOf(t));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${fmtClock(t)}`;
}

/** "yesterday", "Tuesday", "Oct 2": how a person would say when something happened, seen from `now`. */
export function fmtRelativeDay(day: number, now: number): string {
  const today = dayOf(now);
  if (day === today) return 'today';
  if (day === today - 1) return 'yesterday';
  if (today - day < 7) return fmtWeekday(day);
  const d = calendar(day);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
