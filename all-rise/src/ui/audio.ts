/*
 * Every sound is made on the spot with the Web Audio API, so there are no
 * audio files to load. Browsers only allow sound after the player has tapped
 * something, which the title screen's gavel takes care of.
 */
import type { Speaker } from '../core/types';
import { load, save } from './storage';

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let muted = load<boolean>('muted', false);

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  save('muted', value);
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noise) return noise;
  noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

function envelope(ac: AudioContext, peak: number, decay: number, at = ac.currentTime): GainNode {
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  gain.connect(ac.destination);
  return gain;
}

function tone(ac: AudioContext, type: OscillatorType, from: number, to: number, peak: number, decay: number, at = ac.currentTime): void {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + decay);
  osc.connect(envelope(ac, peak, decay, at));
  osc.start(at);
  osc.stop(at + decay + 0.02);
}

/** A hardwood knock: a click of filtered noise, a low thump and a short woody ring. */
export function gavel(): void {
  const ac = audio();
  if (!ac) return;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1700;
  band.Q.value = 1.1;
  src.connect(band).connect(envelope(ac, 0.9, 0.07));
  src.start();
  src.stop(ac.currentTime + 0.1);
  tone(ac, 'sine', 190, 70, 0.9, 0.2);
  tone(ac, 'triangle', 540, 500, 0.25, 0.09);
}

const VOICE: Record<Speaker | 'emoji', number> = { pros: 560, def: 300, defendant: 420, witness: 470, bailiff: 240, emoji: 900 };

/** The little babble that plays while a line types out, pitched per speaker. */
export function blip(who: Speaker | 'emoji'): void {
  const ac = audio();
  if (!ac) return;
  const f = VOICE[who] * (0.92 + Math.random() * 0.18);
  tone(ac, 'square', f, f * 0.98, 0.025, 0.045);
}

/** The gallery muttering. Returns a function that fades it out. */
export function murmur(): () => void {
  const ac = audio();
  if (!ac) return () => {};
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  src.loop = true;
  const low = ac.createBiquadFilter();
  low.type = 'bandpass';
  low.frequency.value = 520;
  low.Q.value = 0.8;
  const gain = ac.createGain();
  const now = ac.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  // Rises and falls at random, like a room full of people talking over each other.
  for (let t = 0.05; t < 8; t += 0.12) gain.gain.linearRampToValueAtTime(0.12 + Math.random() * 0.22, now + t);
  src.connect(low).connect(gain).connect(ac.destination);
  src.start();
  return () => {
    const t = ac.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0.0001, t + 0.35);
    src.stop(t + 0.4);
  };
}

/** A short stab when a lawyer objects. */
export function objection(): void {
  const ac = audio();
  if (!ac) return;
  for (const f of [220, 277, 330]) tone(ac, 'sawtooth', f, f, 0.06, 0.35);
}

/** Plays when the paper comes out: up for a fair ruling, down for a bad one, a thud for overturned. */
export function sting(kind: 'good' | 'meh' | 'bad'): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const notes = kind === 'good' ? [523, 659, 784] : kind === 'meh' ? [440, 494] : [330, 262, 196];
  notes.forEach((f, i) => tone(ac, 'triangle', f, f, 0.18, 0.45, t + i * 0.11));
}
