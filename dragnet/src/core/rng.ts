/**
 * Seeded randomness. The whole city is generated from one seed, and every
 * per-person, per-day decision hashes its own inputs instead of drawing from a
 * shared stream, so asking about Tuesday never changes what happens on Friday
 * and the same question always gets the same answer.
 */

/** Mixes any number of integers (and strings) into one 32-bit hash. */
export function hash(...parts: (number | string)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    if (typeof part === 'string') {
      for (let i = 0; i < part.length; i++) {
        h ^= part.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
    } else {
      h ^= part | 0;
      h = Math.imul(h, 0x01000193);
      h ^= Math.floor(part / 4294967296);
    }
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/** A number in [0, 1) from the given parts. */
export function unit(...parts: (number | string)[]): number {
  return hash(...parts) / 4294967296;
}

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  /** mulberry32 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from an empty list');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Picks by weight; weights need not sum to 1. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    let total = 0;
    for (const item of items) total += Math.max(0, weight(item));
    let r = this.next() * total;
    for (const item of items) {
      r -= Math.max(0, weight(item));
      if (r < 0) return item;
    }
    return items[items.length - 1] as T;
  }

  /** Standard normal, Box-Muller. */
  normal(): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j] as T, items[i] as T];
    }
    return items;
  }
}

/** A fresh generator for one named decision. */
export function rngFor(...parts: (number | string)[]): Rng {
  return new Rng(hash(...parts));
}
