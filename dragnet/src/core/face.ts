/**
 * Face recognition as a nearest-neighbor search. Each photo becomes a vector
 * (here, 64 numbers); a search ranks every face in the gallery by how close
 * its vector is to the probe's. There is no "no match" in a ranking: the list
 * always has a first place, even when the person in the photo isn't in the
 * gallery at all.
 */
import { FACE_DIMS, type Person } from './people';
import { hash, Rng } from './rng';
import type { World } from './world';

export type GallerySource = 'DMV' | 'Booking';

export interface GalleryEntry {
  person: number;
  source: GallerySource;
}

export interface Candidate extends GalleryEntry {
  score: number;
  rank: number;
}

export function gallery(world: World, includeDmv: boolean): GalleryEntry[] {
  const out: GalleryEntry[] = [];
  for (const p of world.people) {
    if (p.hidden) continue;
    if (p.mugshot) out.push({ person: p.id, source: 'Booking' });
    else if (includeDmv && p.license && p.resident) out.push({ person: p.id, source: 'DMV' });
  }
  return out;
}

export function distance2(a: Float32Array, b: Float32Array): number {
  let d = 0;
  for (let k = 0; k < FACE_DIMS; k++) {
    const x = (a[k] as number) - (b[k] as number);
    d += x * x;
  }
  return d;
}

/** Similarity, 0–100, the way vendor software displays it. */
export function similarity(a: Float32Array, b: Float32Array): number {
  return 100 * Math.exp(-distance2(a, b) / (FACE_DIMS * 1.3));
}

/** How much a camera's blur, angle and darkness scramble the vector. */
export function noiseFor(quality: number): number {
  const q = Math.min(1, Math.max(0, quality));
  return 0.08 + 1.1 * (1 - q) * (1 - q);
}

/** What the algorithm extracts from a still of `face` taken at a given quality. */
export function probeOf(face: Float32Array, quality: number, salt: number): Float32Array {
  const rng = new Rng(hash('probe', salt));
  const sigma = noiseFor(quality);
  const out = new Float32Array(FACE_DIMS);
  for (let k = 0; k < FACE_DIMS; k++) out[k] = (face[k] as number) + rng.normal() * sigma;
  return out;
}

export function search(world: World, probe: Float32Array, includeDmv: boolean, limit = 10): Candidate[] {
  return gallery(world, includeDmv)
    .map((g) => ({ ...g, score: similarity(probe, (world.people[g.person] as Person).face), rank: 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c, k) => ({ ...c, rank: k + 1 }));
}

/** Dimensions that drive the eyes and mouth in the drawn face. */
const EYES_MOUTH = [5, 6, 7, 8, 11, 12];

/**
 * "Edits" analysts have made to probes that won't match: pasting in eyes or a
 * mouth from a stock photo, or swapping the photo for a celebrity the suspect
 * resembles. Each gives the algorithm a cleaner face that isn't the suspect's.
 */
export function pasteFeatures(probe: Float32Array, salt: number): Float32Array {
  const rng = new Rng(hash('paste', salt));
  const out = new Float32Array(probe);
  for (const k of EYES_MOUTH) out[k] = rng.normal() * 0.6;
  return out;
}

/** "Enhance": sharpening invents detail. It makes the image look better and the vector no closer to the truth. */
export function enhance(probe: Float32Array, salt: number): Float32Array {
  const rng = new Rng(hash('enhance', salt));
  const out = new Float32Array(FACE_DIMS);
  for (let k = 0; k < FACE_DIMS; k++) out[k] = (probe[k] as number) * 1.15 + rng.normal() * 0.25;
  return out;
}

/**
 * A celebrity lookalike: a sharp, well-lit photo of someone else. Its matches
 * are confident, and they are people who look like the celebrity.
 */
export function celebrity(base: Float32Array, salt: number): Float32Array {
  const rng = new Rng(hash('celeb', salt));
  // The celebrity resembles the probe in the visible features only.
  const out = new Float32Array(FACE_DIMS);
  for (let k = 0; k < FACE_DIMS; k++) out[k] = k < 20 ? (base[k] as number) * 0.8 + rng.normal() * 0.3 : rng.normal();
  return out;
}
