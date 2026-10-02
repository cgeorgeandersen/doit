/**
 * Reads the way a camera points from its OpenStreetMap `direction` (or
 * `camera:direction`) tag.
 *
 * Volunteers enter this by hand, so the same idea arrives in many spellings.
 * In the DeFlock data (September 2026): plain degrees ("135", 87% of cameras),
 * several directions ("90;270"), a field of view as a clockwise range
 * ("338-23"), compass points ("NE", "north"), negative degrees ("-30"), and a
 * little noise ("forward", "disabled!", "150000099"). Anything we can't read
 * is dropped rather than guessed, and a camera with no readable direction is
 * treated as "direction unknown".
 */

import { normalizeBearing } from './geo';

/** A camera's view: the bearing it points along, and how far either side it sees, in degrees. */
export interface ViewCone {
  center: number;
  half: number;
}

/**
 * Half-width of the view we assume when only a bearing is given. A plate
 * reader's lens covers roughly 30–45°, and a hand-entered bearing can be off by
 * 10–15°, so ±40° keeps a camera aimed down your road from being missed.
 */
export const DEFAULT_HALF_ANGLE = 40;

const COMPASS: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

const WORDS: Record<string, string> = {
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W',
  NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW',
};

const NUMBER = /^-?\d+(?:\.\d+)?$/;
const RANGE = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/;

function single(center: number): ViewCone {
  return { center: normalizeBearing(center), half: DEFAULT_HALF_ANGLE };
}

function parsePart(part: string): ViewCone | null {
  if (NUMBER.test(part)) {
    const deg = Number(part);
    // Values past a full turn are typos (e.g. "150000099"), not bearings.
    return Math.abs(deg) <= 360 ? single(deg) : null;
  }

  const range = RANGE.exec(part);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    if (from > 360 || to > 360) return null;
    if (to - from === 360) return { center: 0, half: 180 }; // "0-360": sees all around
    const span = normalizeBearing(to - from); // clockwise, so "338-23" spans 45°
    if (span === 0) return single(from);
    return {
      center: normalizeBearing(from + span / 2),
      half: Math.min(180, Math.max(span / 2, DEFAULT_HALF_ANGLE)),
    };
  }

  const word = part.toUpperCase().replace(/[\s_-]/g, '');
  const compass = COMPASS[word] ?? COMPASS[WORDS[word] ?? ''];
  return compass === undefined ? null : single(compass);
}

/** Parses a direction tag into view cones; an empty array means "unknown". */
export function parseDirection(raw: string | undefined | null): ViewCone[] {
  if (!raw) return [];
  const cones: ViewCone[] = [];
  for (const part of raw.split(/[;,]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const cone = parsePart(trimmed);
    if (cone && !cones.some((c) => c.center === cone.center && c.half === cone.half)) cones.push(cone);
  }
  return cones;
}

const POINTS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

/** "northeast" for 45°, and so on: the nearest of eight compass points. */
export function compassWord(bearingDeg: number): string {
  return POINTS[Math.round(normalizeBearing(bearingDeg) / 45) % 8]!;
}

/** A short human description of where a camera points, e.g. "Faces northeast (45°)". */
export function describeDirection(cones: readonly ViewCone[]): string {
  if (cones.length === 0) return 'Direction not recorded';
  if (cones.some((c) => c.half >= 180)) return 'Sees in every direction';
  if (cones.length === 1) {
    const c = cones[0]!;
    return `Faces ${compassWord(c.center)} (${Math.round(c.center)}°)`;
  }
  if (cones.length > 3) return `Points ${cones.length} ways, covering most directions`;
  const words = [...new Set(cones.map((c) => compassWord(c.center)))];
  return `Faces ${words.join(' and ')}`;
}
