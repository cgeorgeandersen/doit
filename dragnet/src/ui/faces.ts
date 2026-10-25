/**
 * Draws a face from its vector. The first twenty numbers drive what you can
 * see (head shape, skin, hair, eyes, nose, mouth, glasses); the other 44 are
 * the parts of a face embedding no person could point to. Two vectors that
 * are close look alike, which is the point.
 */
import type { Person } from '../core/people';
import { fmtStamp } from '../core/time';

const SKIN = ['#f4d7c3', '#e8c0a0', '#d9a77f', '#c08a5e', '#a06c45', '#7c5033', '#5b3a26'];
const HAIR = ['#1b1714', '#3a271b', '#6a4426', '#c49a5a', '#8e3b1f'];
const IRIS = ['#3b2a1e', '#2d4d6b', '#4a6b3a', '#5a4630'];

const s = (x: number) => 1 / (1 + Math.exp(-x));
const pick = <T>(list: readonly T[], x: number) => list[Math.min(list.length - 1, Math.floor(s(x) * list.length))] as T;

export interface FaceStyle {
  background: 'dmv' | 'booking' | 'plain' | 'none';
  age?: number;
}

export function drawFace(ctx: CanvasRenderingContext2D, v: Float32Array, x: number, y: number, size: number, style: FaceStyle): void {
  const g = (k: number) => v[k] as number;
  const S = size;
  ctx.save();
  ctx.translate(x, y);
  // backdrop
  if (style.background !== 'none') {
    ctx.fillStyle = style.background === 'dmv' ? '#9fb3c6' : style.background === 'booking' ? '#c9ccc4' : '#2a3540';
    ctx.fillRect(0, 0, S, S * 1.2);
    if (style.background === 'booking') {
      ctx.strokeStyle = 'rgba(30,30,30,0.35)';
      ctx.lineWidth = Math.max(1, S / 140);
      ctx.font = `${Math.max(6, S / 16)}px "IBM Plex Mono", monospace`;
      ctx.fillStyle = 'rgba(30,30,30,0.5)';
      for (let k = 0; k < 6; k++) {
        const yy = S * (0.15 + k * 0.17);
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(S, yy);
        ctx.stroke();
        ctx.fillText(`${6 - Math.floor(k / 2)}'${k % 2 ? 6 : 0}`, 3, yy - 2);
      }
    }
  }
  const cx = S / 2;
  const cy = S * 0.58;
  const headW = S * (0.36 + 0.08 * s(g(0)));
  const headH = S * (0.46 + 0.07 * s(g(1)));
  const skin = pick(SKIN, g(2) * 1.4);
  const hairStyle = Math.floor(s(g(3)) * 6);
  const gray = (style.age ?? 40) > 58 ? (style.age ?? 40) > 70 ? '#d8d8d4' : '#8d8a86' : null;
  const hair = gray ?? pick(HAIR, g(4));
  const jaw = s(g(13));

  // shoulders
  ctx.fillStyle = pick(['#2f3e52', '#4b3b33', '#3a4a3a', '#55555e', '#6b2f2f', '#24303a'], g(19));
  ctx.beginPath();
  ctx.ellipse(cx, S * 1.2, S * 0.48, S * 0.3, 0, Math.PI, 0);
  ctx.fill();
  // neck
  ctx.fillStyle = shade(skin, -0.12);
  ctx.fillRect(cx - headW * 0.32, cy + headH * 0.32, headW * 0.64, S * 0.2);

  // long hair behind the head
  if (hairStyle === 4) {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(cx, cy + headH * 0.12, headW * 1.18, headH * 1.0, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // ears
  const ear = S * (0.05 + 0.03 * s(g(14)));
  ctx.fillStyle = shade(skin, -0.06);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * headW * 0.98, cy, ear * 0.7, ear * 1.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(cx - headW, cy - headH * 0.2);
  ctx.bezierCurveTo(cx - headW, cy - headH * 1.05, cx + headW, cy - headH * 1.05, cx + headW, cy - headH * 0.2);
  ctx.bezierCurveTo(cx + headW, cy + headH * (0.45 + 0.2 * jaw), cx + headW * (0.25 + 0.35 * jaw), cy + headH * 0.95, cx, cy + headH * 0.98);
  ctx.bezierCurveTo(cx - headW * (0.25 + 0.35 * jaw), cy + headH * 0.95, cx - headW, cy + headH * (0.45 + 0.2 * jaw), cx - headW, cy - headH * 0.2);
  ctx.fill();

  // hair on top
  ctx.fillStyle = hair;
  if (hairStyle === 1) {
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(cx, cy - headH * 0.55, headW * 0.98, headH * 0.42, 0, Math.PI, 0);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (hairStyle >= 2) {
    ctx.beginPath();
    const puff = hairStyle === 5 ? 1.25 : 1.04;
    ctx.ellipse(cx, cy - headH * 0.5, headW * puff, headH * (hairStyle === 5 ? 0.62 : 0.5), 0, Math.PI, 0);
    ctx.lineTo(cx + headW * puff, cy - headH * 0.25);
    ctx.quadraticCurveTo(cx, cy - headH * (hairStyle === 3 ? 0.75 : 0.55), cx - headW * puff, cy - headH * 0.2);
    ctx.fill();
    if (hairStyle === 5) {
      for (let k = 0; k < 9; k++) {
        ctx.beginPath();
        ctx.arc(cx - headW + (k / 8) * headW * 2, cy - headH * 0.62 - Math.sin((k / 8) * Math.PI) * headH * 0.32, headW * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // brows
  const eyeY = cy - headH * 0.05;
  const spacing = headW * (0.38 + 0.16 * s(g(6)));
  const eye = S * (0.024 + 0.014 * s(g(5)));
  const tilt = (s(g(8)) - 0.5) * 0.5;
  ctx.strokeStyle = gray ? shade(hair, -0.3) : shade(hair, -0.1);
  ctx.lineWidth = S * (0.012 + 0.018 * s(g(7)));
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * (spacing - eye * 2.4), eyeY - eye * 2.6 + side * tilt * eye * 1.5);
    ctx.lineTo(cx + side * (spacing + eye * 2.4), eyeY - eye * 2.9 - side * tilt * eye * 1.5);
    ctx.stroke();
  }
  // eyes
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#f6f2ea';
    ctx.beginPath();
    ctx.ellipse(cx + side * spacing, eyeY, eye * 2.1, eye * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pick(IRIS, g(18));
    ctx.beginPath();
    ctx.arc(cx + side * spacing, eyeY, eye * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(cx + side * spacing, eyeY, eye * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // nose
  const noseLen = headH * (0.2 + 0.14 * s(g(9)));
  const noseW = headW * (0.12 + 0.12 * s(g(10)));
  ctx.strokeStyle = shade(skin, -0.25);
  ctx.lineWidth = Math.max(1, S * 0.012);
  ctx.beginPath();
  ctx.moveTo(cx - noseW * 0.2, eyeY + eye * 1.5);
  ctx.quadraticCurveTo(cx - noseW, eyeY + noseLen, cx - noseW * 0.6, eyeY + noseLen + eye);
  ctx.quadraticCurveTo(cx, eyeY + noseLen + eye * 2, cx + noseW * 0.6, eyeY + noseLen + eye);
  ctx.stroke();
  // mouth
  const mouthY = eyeY + noseLen + headH * 0.2;
  const mouthW = headW * (0.32 + 0.24 * s(g(11)));
  ctx.strokeStyle = shade(skin, -0.42);
  ctx.lineWidth = S * (0.01 + 0.016 * s(g(12)));
  ctx.beginPath();
  ctx.moveTo(cx - mouthW / 2, mouthY);
  ctx.quadraticCurveTo(cx, mouthY + headH * (0.03 + 0.06 * s(g(17))), cx + mouthW / 2, mouthY);
  ctx.stroke();
  // facial hair
  const fh = Math.floor(s(g(15)) * 6);
  if (fh >= 3) {
    ctx.fillStyle = gray ?? hair;
    ctx.globalAlpha = fh === 3 ? 0.35 : 0.9;
    if (fh === 4) {
      ctx.fillRect(cx - mouthW * 0.55, mouthY - headH * 0.09, mouthW * 1.1, headH * 0.06);
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - headW * 0.85, cy + headH * 0.15);
      ctx.quadraticCurveTo(cx - headW * 0.6, cy + headH * 1.05, cx, cy + headH * 1.05);
      ctx.quadraticCurveTo(cx + headW * 0.6, cy + headH * 1.05, cx + headW * 0.85, cy + headH * 0.15);
      ctx.quadraticCurveTo(cx, mouthY + headH * 0.02, cx - headW * 0.85, cy + headH * 0.15);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // glasses
  if (s(g(16)) > 0.74) {
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = Math.max(1, S * 0.014);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(cx + side * spacing - eye * 3.2, eyeY - eye * 2.1, eye * 6.4, eye * 4.2, eye);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - spacing + eye * 3.2, eyeY);
    ctx.lineTo(cx + spacing - eye * 3.2, eyeY);
    ctx.stroke();
  }
  ctx.restore();
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + c * amount)));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

/** A face card: a canvas showing a gallery photo. */
export function faceCanvas(v: Float32Array, size: number, style: FaceStyle): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(size * dpr);
  c.height = Math.round(size * 1.2 * dpr);
  c.style.width = `${size}px`;
  c.style.height = `${size * 1.2}px`;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(dpr, dpr);
  drawFace(ctx, v, 0, 0, size, style);
  return c;
}

export function personPhoto(p: Person, size: number, source: 'DMV' | 'Booking' = p.mugshot ? 'Booking' : 'DMV'): HTMLCanvasElement {
  return faceCanvas(p.face, size, { background: source === 'Booking' ? 'booking' : 'dmv', age: p.age });
}

/**
 * A CCTV still: the face drawn small, dark and tilted, then blown up so the
 * pixels show, with sensor noise and the camera's timestamp burned in.
 */
export function probeCanvas(v: Float32Array, quality: number, size: number, stamp: { t: number; camera: string }, seed = 1): HTMLCanvasElement {
  const out = document.createElement('canvas');
  const W = size;
  const H = Math.round(size * 1.2);
  out.width = W;
  out.height = H;
  out.style.width = `${W}px`;
  out.style.height = `${H}px`;
  const px = Math.max(10, Math.round(14 + quality * 70));
  const small = document.createElement('canvas');
  small.width = px;
  small.height = Math.round(px * 1.2);
  const sctx = small.getContext('2d') as CanvasRenderingContext2D;
  sctx.fillStyle = '#3d4650';
  sctx.fillRect(0, 0, small.width, small.height);
  sctx.save();
  sctx.translate(px / 2, small.height / 2);
  sctx.rotate(-0.12 + (1 - quality) * 0.1);
  sctx.scale(0.86, 0.86);
  sctx.translate(-px / 2, -small.height / 2);
  drawFace(sctx, v, 0, 0, px, { background: 'none', age: 40 });
  sctx.restore();
  const ctx = out.getContext('2d') as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  ctx.filter = `grayscale(${0.4 + (1 - quality) * 0.5}) brightness(${0.62 + quality * 0.3}) contrast(1.15)`;
  ctx.drawImage(small, 0, 0, W, H);
  ctx.filter = 'none';
  // sensor noise
  const img = ctx.getImageData(0, 0, W, H);
  let r = seed * 9301 + 49297;
  for (let k = 0; k < img.data.length; k += 4) {
    r = (r * 9301 + 49297) % 233280;
    const n = (r / 233280 - 0.5) * (70 * (1 - quality) + 12);
    img.data[k] = (img.data[k] as number) + n;
    img.data[k + 1] = (img.data[k + 1] as number) + n;
    img.data[k + 2] = (img.data[k + 2] as number) + n;
  }
  ctx.putImageData(img, 0, 0);
  // scanlines and stamp
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, H - 18, W, 18);
  ctx.font = '500 9px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#e6f0f5';
  ctx.textBaseline = 'middle';
  const time = W < 200 ? fmtStamp(stamp.t).slice(5) : fmtStamp(stamp.t);
  ctx.fillText(time, 5, H - 9);
  const room = W - 15 - ctx.measureText(time).width;
  if (stamp.camera && ctx.measureText(stamp.camera).width < room) {
    ctx.textAlign = 'right';
    ctx.fillText(stamp.camera, W - 5, H - 9);
  }
  return out;
}
