/**
 * A plate reader capture: the back of the car as the camera saw it, the plate
 * crop, and what the OCR made of it. At night the cameras shoot in infrared,
 * so the picture is gray.
 */
import { COLOR_HEX, type Vehicle } from '../core/people';
import { fmtStamp, minuteOfDay } from '../core/time';
import type { Read } from '../core/world';

export function captureCanvas(v: Vehicle, read: Read, camera: string, width = 320): HTMLCanvasElement {
  const W = width;
  const H = Math.round(width * 0.62);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = W * dpr;
  c.height = H * dpr;
  c.style.width = `${W}px`;
  c.style.height = `${H}px`;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(dpr, dpr);
  const m = minuteOfDay(read.t);
  const night = m < 6 * 60 + 50 || m > 18 * 60 + 15;
  const blur = Math.max(0, (96 - read.conf) / 9);

  ctx.filter = `${night ? 'grayscale(1) contrast(1.3) brightness(1.1)' : 'saturate(0.8)'} blur(${(blur * 0.25).toFixed(2)}px)`;
  // road and background
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, night ? '#1a1d22' : '#56636f');
  sky.addColorStop(0.55, night ? '#24282e' : '#7d8790');
  sky.addColorStop(1, night ? '#15171a' : '#3f454b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = night ? '#2c3036' : '#4a5057';
  ctx.fillRect(0, H * 0.72, W, H * 0.28);
  ctx.strokeStyle = 'rgba(240, 230, 180, 0.6)';
  ctx.setLineDash([18, 14]);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W * 0.08, H * 0.95);
  ctx.lineTo(W * 0.3, H * 0.74);
  ctx.stroke();
  ctx.setLineDash([]);

  // car body, by type
  const body = COLOR_HEX[v.color] ?? '#999';
  const cx = W / 2;
  const base = H * 0.86;
  const tall = { sedan: 0.42, coupe: 0.38, hatchback: 0.46, wagon: 0.48, SUV: 0.56, minivan: 0.6, pickup: 0.5, van: 0.66 }[v.type];
  const wide = { sedan: 0.62, coupe: 0.6, hatchback: 0.58, wagon: 0.64, SUV: 0.68, minivan: 0.7, pickup: 0.7, van: 0.7 }[v.type];
  const top = base - H * tall;
  const half = (W * wide) / 2;
  ctx.fillStyle = '#111';
  ctx.fillRect(cx - half + 8, base - 8, 34, 16);
  ctx.fillRect(cx + half - 42, base - 8, 34, 16);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(cx - half, base);
  ctx.lineTo(cx - half, top + H * tall * 0.45);
  ctx.quadraticCurveTo(cx - half * 0.86, top, cx - half * 0.55, top);
  ctx.lineTo(cx + half * 0.55, top);
  ctx.quadraticCurveTo(cx + half * 0.86, top, cx + half, top + H * tall * 0.45);
  ctx.lineTo(cx + half, base);
  ctx.closePath();
  ctx.fill();
  // rear window
  ctx.fillStyle = night ? '#0d0f12' : 'rgba(20, 30, 40, 0.85)';
  ctx.beginPath();
  ctx.moveTo(cx - half * 0.72, top + H * tall * 0.4);
  ctx.quadraticCurveTo(cx - half * 0.66, top + 6, cx - half * 0.45, top + 6);
  ctx.lineTo(cx + half * 0.45, top + 6);
  ctx.quadraticCurveTo(cx + half * 0.66, top + 6, cx + half * 0.72, top + H * tall * 0.4);
  ctx.closePath();
  ctx.fill();
  if (v.type === 'pickup') {
    ctx.fillStyle = shadeRgb(body, -0.25);
    ctx.fillRect(cx - half, top + H * tall * 0.45, half * 2, H * tall * 0.15);
  }
  // lights
  ctx.fillStyle = night ? '#f2f2f2' : '#c0302a';
  ctx.fillRect(cx - half + 6, top + H * tall * 0.5, half * 0.32, H * 0.05);
  ctx.fillRect(cx + half - 6 - half * 0.32, top + H * tall * 0.5, half * 0.32, H * 0.05);
  // bumper
  ctx.fillStyle = shadeRgb(body, -0.35);
  ctx.fillRect(cx - half, base - H * 0.08, half * 2, H * 0.08);
  // features
  if (v.features.includes('roof rack')) {
    ctx.fillStyle = '#222';
    ctx.fillRect(cx - half * 0.6, top - 6, half * 1.2, 5);
  }
  if (v.features.includes('bike rack')) {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - half * 0.5, top + H * tall * 0.15, half, H * tall * 0.3);
  }
  if (v.features.includes('tow hitch')) {
    ctx.fillStyle = '#333';
    ctx.fillRect(cx - 6, base - 2, 12, 9);
  }
  const stickers = v.features.filter((f) => f.startsWith('bumper sticker: '));
  stickers.forEach((sticker, k) => {
    const label = sticker.replace('bumper sticker: ', '');
    const sx = cx + half * 0.32 + k * 4;
    const sy = base - H * 0.15 - k * 12;
    ctx.fillStyle = label === 'rainbow flag' ? '#c04ad8' : label === 'Thin Blue Line flag' ? '#203050' : '#f2f2ea';
    ctx.fillRect(sx, sy, half * 0.5, 10);
    ctx.fillStyle = '#222';
    ctx.font = '600 6.5px "IBM Plex Sans Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.toUpperCase().slice(0, 18), sx + half * 0.25, sy + 5.5);
  });
  if (v.features.includes('dented rear bumper')) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx - half * 0.55, base - H * 0.04, 8, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  // plate
  const pw = half * 0.62;
  const ph = pw * 0.48;
  const px = cx - pw / 2;
  const py = base - H * 0.08 - ph - 4;
  ctx.fillStyle = night ? '#f4f4f4' : '#e9ecef';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px, py, pw, ph);
  ctx.fillStyle = v.outOfState ? '#7a1f1f' : '#1d3b78';
  ctx.font = `700 ${ph * 0.58}px "IBM Plex Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(v.plate, cx, py + ph * 0.56, pw * 0.92);
  ctx.filter = 'none';

  // OCR box and stamp
  ctx.strokeStyle = read.conf < 80 ? '#ffb547' : '#39d0ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(px - 4, py - 4, pw + 8, ph + 8);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, 18);
  ctx.font = '500 9.5px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#e6f0f5';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(fmtStamp(read.t), 6, 9);
  ctx.textAlign = 'right';
  ctx.fillText(camera, W - 6, 9);
  return c;
}

function shadeRgb(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + c * amount)));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}
