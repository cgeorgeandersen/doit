/**
 * Console sounds, synthesized: a blip for alerts and the bangs the gunshot
 * sensors heard. Gunfire, fireworks and a backfire are all short bursts of
 * noise with a sharp attack, which is why telling them apart is hard for
 * people and machines.
 */
import type { SoundKind } from '../core/acoustic';
import { hash, Rng } from '../core/rng';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function blip(kind: 'alert' | 'hit' | 'soft' | 'case' = 'soft'): void {
  const a = audio();
  if (!a) return;
  const notes = { alert: [880, 660, 880], hit: [520, 780, 1040, 780], soft: [1200], case: [660, 990] }[kind];
  const t0 = a.currentTime;
  notes.forEach((f, k) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = kind === 'hit' ? 'square' : 'sine';
    o.frequency.value = f;
    const start = t0 + k * 0.09;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(kind === 'soft' ? 0.03 : 0.06, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.08);
    o.connect(g).connect(a.destination);
    o.start(start);
    o.stop(start + 0.1);
  });
}

/** Builds the recording of a bang (or bangs) as raw samples, for playing and for drawing. */
export function impulseSamples(kind: SoundKind, rounds: number, seed: string, rate = 22050): Float32Array {
  const rng = new Rng(hash('sound', seed));
  const times: number[] = [];
  let t = 0.12;
  for (let k = 0; k < rounds; k++) {
    times.push(t);
    if (kind === 'gunfire') t += 0.22 + rng.next() * 0.25;
    else if (kind === 'fireworks') t += 0.06 + rng.next() * 0.22;
    else if (kind === 'construction') t += 0.35 + rng.next() * 0.05;
    else t += 0.5 + rng.next() * 0.4;
  }
  const length = Math.ceil((t + 0.6) * rate);
  const out = new Float32Array(length);
  const decay = { gunfire: 0.05, fireworks: 0.035, backfire: 0.11, construction: 0.025, dumpster: 0.09 }[kind];
  const tone = { gunfire: 0.55, fireworks: 0.8, backfire: 0.2, construction: 0.7, dumpster: 0.35 }[kind];
  for (const start of times) {
    const amp = 0.55 + rng.next() * 0.4;
    const s0 = Math.floor(start * rate);
    let lp = 0;
    for (let k = 0; k < rate * 0.5 && s0 + k < length; k++) {
      const env = Math.exp(-k / (rate * decay));
      const noise = rng.next() * 2 - 1;
      lp = lp + tone * (noise - lp);
      out[s0 + k] = (out[s0 + k] as number) + lp * amp * env;
    }
    // the echo off buildings
    const echo = s0 + Math.floor(rate * (0.08 + rng.next() * 0.06));
    for (let k = 0; k < rate * 0.25 && echo + k < length; k++) {
      out[echo + k] = (out[echo + k] as number) + (rng.next() * 2 - 1) * 0.12 * amp * Math.exp(-k / (rate * decay * 2));
    }
  }
  return out;
}

export function play(samples: Float32Array, rate = 22050): void {
  const a = audio();
  if (!a) return;
  const buffer = a.createBuffer(1, samples.length, rate);
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  const src = a.createBufferSource();
  src.buffer = buffer;
  const g = a.createGain();
  g.gain.value = 0.5;
  src.connect(g).connect(a.destination);
  src.start();
}

export function waveformCanvas(samples: Float32Array, width: number, height: number, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = width * dpr;
  c.height = height * dpr;
  c.style.width = `${width}px`;
  c.style.height = `${height}px`;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.scale(dpr, dpr);
  g.strokeStyle = color;
  g.lineWidth = 1;
  const step = samples.length / width;
  g.beginPath();
  for (let x = 0; x < width; x++) {
    let peak = 0;
    for (let k = Math.floor(x * step); k < Math.floor((x + 1) * step); k++) peak = Math.max(peak, Math.abs(samples[k] ?? 0));
    const y = Math.min(1, peak * 1.6) * (height / 2 - 1);
    g.moveTo(x + 0.5, height / 2 - y);
    g.lineTo(x + 0.5, height / 2 + y);
  }
  g.stroke();
  return c;
}
