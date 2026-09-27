/**
 * The math between "a list of probabilities" and "a word on the screen".
 *
 * Temperature reshapes the odds before the dice are rolled:
 *   p_i' = p_i^(1/T) / Σ_j p_j^(1/T)
 * T < 1 sharpens the distribution (the favourite wins more often),
 * T = 1 leaves it as trained, T > 1 flattens it toward uniform.
 * This is the same as dividing log-probabilities (or "logits") by T
 * before a softmax, which is how large language models do it.
 */
import type { Rng } from './rng';

/** Apply a temperature to a probability distribution. Returns a new array that sums to 1. */
export function applyTemperature(probs: Float64Array, temperature: number): Float64Array {
  const n = probs.length;
  const out = new Float64Array(n);
  if (temperature <= 0) {
    // The T → 0 limit: all probability on the single most likely option.
    out[argmax(probs)] = 1;
    return out;
  }
  if (temperature === 1) {
    out.set(probs);
    return normalizeInPlace(out);
  }
  // Work in log space so tiny probabilities raised to large powers don't underflow into NaN.
  let maxLog = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const p = probs[i]!;
    if (p > 0) {
      const l = Math.log(p) / temperature;
      out[i] = l;
      if (l > maxLog) maxLog = l;
    } else {
      out[i] = -Infinity;
    }
  }
  for (let i = 0; i < n; i += 1) out[i] = Math.exp(out[i]! - maxLog);
  return normalizeInPlace(out);
}

export function normalizeInPlace(values: Float64Array): Float64Array {
  let total = 0;
  for (let i = 0; i < values.length; i += 1) total += values[i]!;
  if (total > 0) for (let i = 0; i < values.length; i += 1) values[i] = values[i]! / total;
  return values;
}

export function argmax(values: Float64Array): number {
  let best = 0;
  for (let i = 1; i < values.length; i += 1) if (values[i]! > values[best]!) best = i;
  return best;
}

/**
 * Shannon entropy in bits: how uncertain the next word is.
 * 0 bits = one certain choice; log2(n) bits = n equally likely choices.
 */
export function entropyBits(probs: Float64Array): number {
  let h = 0;
  for (let i = 0; i < probs.length; i += 1) {
    const p = probs[i]!;
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}

/** 2^entropy: the number of equally likely words that would be "as uncertain" as this distribution. */
export function effectiveChoices(probs: Float64Array): number {
  return 2 ** entropyBits(probs);
}

/** Roll the dice: pick an index with probability proportional to its value. */
export function sampleIndex(probs: Float64Array, rng: Rng): number {
  const u = rng();
  let cumulative = 0;
  let last = 0;
  for (let i = 0; i < probs.length; i += 1) {
    const p = probs[i]!;
    if (p <= 0) continue;
    cumulative += p;
    last = i;
    if (u < cumulative) return i;
  }
  return last; // floating-point shortfall: fall back to the last non-zero option
}

/**
 * Nucleus ("top-p") truncation: keep the smallest set of most-likely options
 * whose probabilities add up to at least `p`, drop the long tail, renormalize.
 * Many real systems sample this way so one freak word can't derail the text.
 */
export function nucleus(probs: Float64Array, p: number): Float64Array {
  if (p >= 1) return Float64Array.from(probs);
  const order = [...probs.keys()].sort((a, b) => probs[b]! - probs[a]! || a - b);
  const out = new Float64Array(probs.length);
  let mass = 0;
  for (const i of order) {
    out[i] = probs[i]!;
    mass += probs[i]!;
    if (mass >= p) break;
  }
  return normalizeInPlace(out);
}

export interface Ranked {
  index: number;
  p: number;
}

/** The k most likely options, highest first (ties broken by index for stable output). */
export function topK(probs: Float64Array, k: number): Ranked[] {
  const best: Ranked[] = [];
  for (let i = 0; i < probs.length; i += 1) {
    const p = probs[i]!;
    if (best.length < k || p > best[best.length - 1]!.p) {
      let pos = best.length;
      while (pos > 0 && best[pos - 1]!.p < p) pos -= 1;
      best.splice(pos, 0, { index: i, p });
      if (best.length > k) best.pop();
    }
  }
  return best;
}
