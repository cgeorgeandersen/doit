/**
 * The city map: a canvas redrawn every frame. Streets and buildings first,
 * then the sensors, then the moving cars, then whatever overlays the open
 * tool adds (trails, geofences, the Stingray's rings). Pan by dragging, zoom
 * with the wheel or a pinch.
 */
import {
  AVENUES, BLOCK_H, BLOCK_W, BRIDGE_COLS, COLS, type District, districtOf, HEIGHT, nodeXY, type Place, RIVER_ROW, ROWS,
  STREETS, WIDTH,
} from '../core/city';
import type { Rect } from '../core/location';
import { COLOR_HEX, type Vehicle } from '../core/people';
import { tripPosition, type Trip } from '../core/schedule';
import { dayOf, minuteOfDay } from '../core/time';
import type { World } from '../core/world';

export interface Overlay {
  draw(ctx: CanvasRenderingContext2D, map: MapView, now: number): void;
}

export type MapMode = 'pan' | 'rect' | 'point';

export type Hit =
  | { kind: 'vehicle'; id: number }
  | { kind: 'camera'; id: number }
  | { kind: 'cctv'; id: number }
  | { kind: 'sensor'; id: number }
  | { kind: 'place'; id: number };

export interface Layers {
  cameras: boolean;
  sensors: boolean;
  cctv: boolean;
  traffic: boolean;
  phones: boolean;
}

const DISTRICT_FILL: Record<District, string> = {
  Northgate: '#0f1d27',
  Westfield: '#0f1c24',
  'Old Town': '#13202e',
  Eastside: '#121c26',
  Riverside: '#0e1c20',
  Harbor: '#141b24',
};

const KIND_FILL: Partial<Record<Place['kind'], string>> = {
  home: '#1e3242',
  apartment: '#22384b',
  civic: '#2b4a72',
  health: '#38365a',
  religion: '#3a3650',
  school: '#2e4260',
  work: '#283f57',
  shop: '#2b3d52',
  bar: '#363852',
  gym: '#284256',
  motel: '#363646',
  legal: '#2e3e5e',
  shelter: '#1e3242',
  union: '#314060',
  parking: '#18242f',
  transit: '#2a4566',
};

const MARGIN_X = 150;
const MARGIN_TOP = 120;
const MARGIN_BOTTOM = 210;

interface DrawnVehicle {
  id: number;
  sx: number;
  sy: number;
}

export class MapView {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly world: World;
  width = 0;
  height = 0;
  dpr = 1;
  scale = 0.4;
  ox = 0;
  oy = 0;
  minScale = 0.2;
  maxScale = 4;
  mode: MapMode = 'pan';
  layers: Layers = { cameras: true, sensors: false, cctv: false, traffic: true, phones: false };
  overlays = new Map<string, Overlay>();
  highlight = new Set<number>();
  /** Camera id → time of its last read, for the flash. */
  flashes = new Map<number, number>();
  onRect: ((r: Rect) => void) | null = null;
  onPoint: ((x: number, y: number) => void) | null = null;
  onHit: ((hit: Hit | null, sx: number, sy: number) => void) | null = null;
  onRectPreview: ((r: Rect | null) => void) | null = null;
  rectDraft: Rect | null = null;
  private drawn: DrawnVehicle[] = [];
  private tripCache = new Map<number, Trip[]>();
  private tripCacheDay = -1;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; ox: number; oy: number; t: number; moved: boolean; world: { x: number; y: number } } | null = null;
  private pinch: { d: number; scale: number; cx: number; cy: number; wx: number; wy: number } | null = null;
  private fitted = false;
  private reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.canvas = canvas;
    this.world = world;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D canvas');
    this.ctx = ctx;
    this.bindInput();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    if (!this.fitted) {
      this.fit();
      this.fitted = true;
    } else {
      this.clamp();
    }
  }

  fit(): void {
    const w = WIDTH + 2 * MARGIN_X * 0.6;
    const hgt = HEIGHT + MARGIN_TOP * 0.4 + MARGIN_BOTTOM * 0.5;
    this.scale = Math.min(this.width / w, this.height / hgt);
    this.minScale = this.scale * 0.8;
    this.maxScale = Math.max(3, this.scale * 8);
    this.ox = (this.width - WIDTH * this.scale) / 2;
    this.oy = (this.height - (HEIGHT + MARGIN_BOTTOM * 0.45 - MARGIN_TOP * 0.25) * this.scale) / 2;
  }

  toScreen(x: number, y: number): { x: number; y: number } {
    return { x: this.ox + x * this.scale, y: this.oy + y * this.scale };
  }

  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale };
  }

  /** Centers on a point, optionally zooming in. */
  flyTo(x: number, y: number, scale?: number): void {
    if (scale !== undefined) this.scale = Math.min(this.maxScale, Math.max(this.minScale, scale));
    this.ox = this.width / 2 - x * this.scale;
    this.oy = this.height / 2 - y * this.scale;
    this.clamp();
  }

  /** Zooms to show a box of the city. */
  frame(x0: number, y0: number, x1: number, y1: number, pad = 60): void {
    const w = Math.max(80, x1 - x0) + pad * 2;
    const hh = Math.max(80, y1 - y0) + pad * 2;
    const scale = Math.min(this.width / w, this.height / hh);
    this.flyTo((x0 + x1) / 2, (y0 + y1) / 2, scale);
  }

  zoomBy(factor: number, sx = this.width / 2, sy = this.height / 2): void {
    const before = this.toWorld(sx, sy);
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    this.ox = sx - before.x * this.scale;
    this.oy = sy - before.y * this.scale;
    this.clamp();
  }

  private clamp(): void {
    const minX = -MARGIN_X;
    const maxX = WIDTH + MARGIN_X;
    const minY = -MARGIN_TOP;
    const maxY = HEIGHT + MARGIN_BOTTOM;
    const left = this.ox + minX * this.scale;
    const right = this.ox + maxX * this.scale;
    const top = this.oy + minY * this.scale;
    const bottom = this.oy + maxY * this.scale;
    const spanX = right - left;
    const spanY = bottom - top;
    if (spanX < this.width) this.ox += (this.width - spanX) / 2 - left;
    else if (left > 0) this.ox -= left;
    else if (right < this.width) this.ox += this.width - right;
    if (spanY < this.height) this.oy += (this.height - spanY) / 2 - top;
    else if (top > 0) this.oy -= top;
    else if (bottom < this.height) this.oy += this.height - bottom;
  }

  // ---------------------------------------------------------------------------
  // Input

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const p = this.local(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const w = this.toWorld(cx, cy);
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: this.scale, cx, cy, wx: w.x, wy: w.y };
        this.drag = null;
        this.rectDraft = null;
        return;
      }
      this.drag = { x: p.x, y: p.y, ox: this.ox, oy: this.oy, t: performance.now(), moved: false, world: this.toWorld(p.x, p.y) };
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.local(e);
      if (!this.pointers.has(e.pointerId)) {
        this.hover(p.x, p.y);
        return;
      }
      this.pointers.set(e.pointerId, p);
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.pinch.scale * (d / this.pinch.d)));
        this.ox = cx - this.pinch.wx * this.scale;
        this.oy = cy - this.pinch.wy * this.scale;
        this.clamp();
        return;
      }
      const d = this.drag;
      if (!d) return;
      if (Math.hypot(p.x - d.x, p.y - d.y) > 5) d.moved = true;
      if (this.mode === 'rect') {
        const w = this.toWorld(p.x, p.y);
        this.rectDraft = { x0: d.world.x, y0: d.world.y, x1: w.x, y1: w.y };
        this.onRectPreview?.(this.rectDraft);
        return;
      }
      if (d.moved) {
        this.ox = d.ox + (p.x - d.x);
        this.oy = d.oy + (p.y - d.y);
        this.clamp();
        c.style.cursor = 'grabbing';
      }
    });
    const end = (e: PointerEvent) => {
      const p = this.local(e);
      this.pointers.delete(e.pointerId);
      if (this.pinch) {
        if (this.pointers.size < 2) this.pinch = null;
        this.drag = null;
        return;
      }
      const d = this.drag;
      this.drag = null;
      c.style.cursor = '';
      if (!d) return;
      if (this.mode === 'rect' && d.moved && this.rectDraft) {
        const r = this.rectDraft;
        if (Math.abs(r.x1 - r.x0) > 8 && Math.abs(r.y1 - r.y0) > 8) this.onRect?.(r);
        return;
      }
      if (!d.moved && performance.now() - d.t < 600) {
        const w = this.toWorld(p.x, p.y);
        if (this.mode === 'point') {
          this.onPoint?.(w.x, w.y);
          return;
        }
        this.onHit?.(this.hitTest(p.x, p.y), p.x, p.y);
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = this.local(e);
        this.zoomBy(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
      },
      { passive: false },
    );
  }

  private local(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private hover(sx: number, sy: number): void {
    if (this.mode !== 'pan') {
      this.canvas.style.cursor = 'crosshair';
      return;
    }
    this.canvas.style.cursor = this.hitTest(sx, sy) ? 'pointer' : 'grab';
  }

  hitTest(sx: number, sy: number): Hit | null {
    let best: Hit | null = null;
    let bestD = 14;
    for (const v of this.drawn) {
      const d = Math.hypot(v.sx - sx, v.sy - sy);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'vehicle', id: v.id };
      }
    }
    if (best) return best;
    bestD = 13;
    if (this.layers.cameras) {
      for (const cam of this.world.city.cameras) {
        const p = this.toScreen(cam.x, cam.y);
        const d = Math.hypot(p.x - sx, p.y - sy);
        if (d < bestD) {
          bestD = d;
          best = { kind: 'camera', id: cam.id };
        }
      }
    }
    if (this.layers.cctv) {
      for (const cam of this.world.city.cctv) {
        const p = this.toScreen(cam.x, cam.y);
        const d = Math.hypot(p.x - sx, p.y - sy);
        if (d < bestD) {
          bestD = d;
          best = { kind: 'cctv', id: cam.id };
        }
      }
    }
    if (best) return best;
    const w = this.toWorld(sx, sy);
    for (const place of this.world.city.places) {
      if (place.kind === 'outside') continue;
      const [hw, hh] = footprint(place);
      const pad = 6 / this.scale;
      if (Math.abs(w.x - place.x) < hw / 2 + pad && Math.abs(w.y - place.y) < hh / 2 + pad) return { kind: 'place', id: place.id };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Drawing

  render(now: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#05090d';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);
    this.drawGround();
    this.drawWater(now);
    this.drawRoads();
    this.drawBuildings();
    ctx.restore();
    this.drawLabels();
    this.drawNight(now);
    if (this.layers.sensors) this.drawSensors();
    if (this.layers.cctv) this.drawCctv();
    if (this.layers.cameras) this.drawCameras(now);
    if (this.layers.phones) this.drawPhones(now);
    if (this.layers.traffic) this.drawTraffic(now);
    for (const overlay of this.overlays.values()) {
      ctx.save();
      overlay.draw(ctx, this, now);
      ctx.restore();
    }
    if (this.rectDraft && this.mode === 'rect') this.drawRect(this.rectDraft, '#39d0ff', true);
  }

  private drawGround(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#0b141b';
    ctx.fillRect(-MARGIN_X, -MARGIN_TOP, WIDTH + 2 * MARGIN_X, HEIGHT + MARGIN_TOP + 60);
    for (let bj = 0; bj < ROWS - 1; bj++) {
      if (bj === RIVER_ROW) continue;
      for (let bi = 0; bi < COLS - 1; bi++) {
        ctx.fillStyle = DISTRICT_FILL[districtOf(bi, bj)];
        ctx.fillRect(bi * BLOCK_W + 7, bj * BLOCK_H + 7, BLOCK_W - 14, BLOCK_H - 14);
      }
    }
    for (const park of this.world.city.parks) {
      const x = park.bi * BLOCK_W + 9;
      const y = park.bj * BLOCK_H + 9;
      ctx.fillStyle = '#0c1d17';
      ctx.fillRect(x, y, BLOCK_W - 18, BLOCK_H - 18);
      ctx.fillStyle = '#10261d';
      for (let k = 0; k < 9; k++) {
        const tx = x + 14 + ((k * 37) % (BLOCK_W - 46));
        const ty = y + 14 + ((k * 23) % (BLOCK_H - 46));
        ctx.beginPath();
        ctx.arc(tx, ty, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawWater(now: number): void {
    const ctx = this.ctx;
    const top = RIVER_ROW * BLOCK_H + 16;
    const bottom = (RIVER_ROW + 1) * BLOCK_H - 16;
    ctx.fillStyle = '#061826';
    ctx.fillRect(-MARGIN_X, top, WIDTH + 2 * MARGIN_X, bottom - top);
    // the bay, south of Harbor Rd
    const bay = HEIGHT + 26;
    ctx.fillRect(-MARGIN_X, bay, WIDTH + 2 * MARGIN_X, MARGIN_BOTTOM + 40);
    ctx.strokeStyle = '#0d2a3e';
    ctx.lineWidth = 2;
    const drift = this.reduceMotion ? 0 : (minuteOfDay(now) * 6) % 80;
    for (let y = top + 14; y < bottom - 6; y += 22) {
      ctx.beginPath();
      for (let x = -MARGIN_X + ((y * 7) % 60) - drift; x < WIDTH + MARGIN_X; x += 80) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 26, y);
      }
      ctx.stroke();
    }
    for (let y = bay + 24; y < bay + MARGIN_BOTTOM; y += 26) {
      ctx.beginPath();
      for (let x = -MARGIN_X + ((y * 11) % 70) + drift * 0.5; x < WIDTH + MARGIN_X; x += 90) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 30, y);
      }
      ctx.stroke();
    }
    // piers
    ctx.fillStyle = '#16212b';
    for (const px of [6.6, 7.6, 8.6, 9.6, 10.6, 11.4]) {
      ctx.fillRect(px * BLOCK_W - 10, HEIGHT + 18, 20, 120);
    }
    ctx.fillStyle = '#1d2a35';
    ctx.fillRect(9.6 * BLOCK_W - 40, HEIGHT + 100, 80, 26);
  }

  private drawRoads(): void {
    const ctx = this.ctx;
    const n = COLS * ROWS;
    ctx.lineCap = 'round';
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass === 0 ? '#1a2a38' : '#2b4458';
      ctx.lineWidth = pass === 0 ? 15 : 1.2;
      ctx.beginPath();
      for (let a = 0; a < n; a++) {
        for (const b of this.world.city.neighbors[a] as number[]) {
          if (b < a) continue;
          const pa = nodeXY(a);
          const pb = nodeXY(b);
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
        }
      }
      // roads leaving town
      ctx.moveTo(0, 4 * BLOCK_H);
      ctx.lineTo(-MARGIN_X, 4 * BLOCK_H);
      ctx.moveTo(WIDTH, 3 * BLOCK_H);
      ctx.lineTo(WIDTH + MARGIN_X, 3 * BLOCK_H);
      ctx.moveTo(6 * BLOCK_W, 0);
      ctx.lineTo(6 * BLOCK_W, -MARGIN_TOP);
      ctx.stroke();
    }
    // bridge rails
    ctx.strokeStyle = '#2a4052';
    ctx.lineWidth = 1.5;
    for (const i of BRIDGE_COLS) {
      const x = i * BLOCK_W;
      const y0 = RIVER_ROW * BLOCK_H + 12;
      const y1 = (RIVER_ROW + 1) * BLOCK_H - 12;
      ctx.beginPath();
      ctx.moveTo(x - 9, y0);
      ctx.lineTo(x - 9, y1);
      ctx.moveTo(x + 9, y0);
      ctx.lineTo(x + 9, y1);
      ctx.stroke();
    }
  }

  private drawBuildings(): void {
    const ctx = this.ctx;
    for (const p of this.world.city.places) {
      if (p.kind === 'outside') continue;
      const [w, hh] = footprint(p);
      ctx.fillStyle = KIND_FILL[p.kind] ?? '#1a2836';
      ctx.fillRect(p.x - w / 2, p.y - hh / 2, w, hh);
      if (p.kind === 'parking') {
        ctx.strokeStyle = '#22313f';
        ctx.lineWidth = 1;
        for (let k = -2; k <= 2; k++) {
          ctx.beginPath();
          ctx.moveTo(p.x + k * 9, p.y - hh / 2 + 3);
          ctx.lineTo(p.x + k * 9, p.y + hh / 2 - 3);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect(p.x - w / 2, p.y - hh / 2, w, 3);
      }
    }
  }

  private drawLabels(): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // districts
    const centers: Record<District, [number, number]> = {
      Northgate: [2.5, 0.5], Westfield: [1.5, 3.2], 'Old Town': [5.5, 3.5], Eastside: [10, 2.5], Riverside: [2.5, 7.5], Harbor: [9, 7.55],
    };
    const size = Math.max(10, Math.min(30, 46 * this.scale));
    ctx.font = `600 ${size}px "IBM Plex Sans Condensed", sans-serif`;
    ctx.fillStyle = 'rgba(140, 180, 210, 0.2)';
    for (const [name, [bx, by]] of Object.entries(centers)) {
      const p = this.toScreen(bx * BLOCK_W, by * BLOCK_H);
      ctx.save();
      ctx.letterSpacing = `${size * 0.18}px`;
      ctx.fillText(name.toUpperCase(), p.x, p.y);
      ctx.restore();
    }
    // river
    const rp = this.toScreen(4.2 * BLOCK_W, (RIVER_ROW + 0.5) * BLOCK_H);
    ctx.font = `italic 400 ${Math.max(9, Math.min(15, 22 * this.scale))}px "IBM Plex Sans", sans-serif`;
    ctx.fillStyle = 'rgba(80, 140, 180, 0.45)';
    ctx.fillText('Calder River', rp.x, rp.y);
    const bp = this.toScreen(3 * BLOCK_W, HEIGHT + 120);
    ctx.fillText('Avery Bay', bp.x, bp.y);
    // streets, when close enough to read
    if (this.scale > 0.75) {
      ctx.font = `500 ${Math.min(12, 9 * this.scale)}px "IBM Plex Mono", monospace`;
      ctx.fillStyle = 'rgba(140, 175, 200, 0.42)';
      for (let i = 0; i < COLS; i++) {
        for (const j of [0.5, 3.5, 7.5]) {
          const p = this.toScreen(i * BLOCK_W, j * BLOCK_H);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(AVENUES[i] as string, 0, 0);
          ctx.restore();
        }
      }
      for (let j = 0; j < ROWS; j++) {
        if (j === RIVER_ROW || j === RIVER_ROW + 1) continue;
        for (const i of [1.5, 6.5, 10.5]) {
          const p = this.toScreen(i * BLOCK_W, j * BLOCK_H);
          ctx.fillText(STREETS[j] as string, p.x, p.y);
        }
      }
    }
    // landmarks
    if (this.scale > 0.55) {
      ctx.font = `500 ${Math.min(13, 10.5 * this.scale)}px "IBM Plex Sans Condensed", sans-serif`;
      for (const p of this.world.city.places) {
        if (p.kind === 'home' || p.kind === 'apartment' || p.kind === 'outside') continue;
        const s = this.toScreen(p.x, p.y + footprint(p)[1] / 2 + 9);
        if (s.x < -80 || s.y < -20 || s.x > this.width + 80 || s.y > this.height + 20) continue;
        ctx.fillStyle = 'rgba(190, 210, 228, 0.62)';
        ctx.fillText(shortName(p), s.x, s.y);
      }
    }
  }

  /** Dusk falls around 6 p.m. in late October. */
  private drawNight(now: number): void {
    const m = minuteOfDay(now);
    let dark = 0;
    if (m > 17 * 60 + 40) dark = Math.min(1, (m - (17 * 60 + 40)) / 70);
    if (m < 7 * 60 + 30) dark = Math.min(1, (7 * 60 + 30 - m) / 60);
    if (dark <= 0) return;
    this.ctx.fillStyle = `rgba(2, 4, 14, ${0.32 * dark})`;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawCameras(now: number): void {
    const ctx = this.ctx;
    const r = Math.max(4.5, Math.min(7, 7 * this.scale));
    for (const cam of this.world.city.cameras) {
      const p = this.toScreen(cam.x, cam.y);
      const flash = this.flashes.get(cam.id);
      const age = flash !== undefined ? (now - flash) * 60 : Infinity;
      if (age < 1.6 && !this.reduceMotion) {
        ctx.fillStyle = `rgba(57, 208, 255, ${0.35 * (1 - age / 1.6)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 10 * (age / 1.6) + 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // cone
      const a = ((cam.heading - 90) * Math.PI) / 180;
      ctx.fillStyle = 'rgba(57, 208, 255, 0.14)';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, r * 4.6, a - 0.45, a + 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = age < 0.5 ? '#bff0ff' : '#39d0ff';
      ctx.strokeStyle = '#05090d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x + r, p.y);
      ctx.lineTo(p.x, p.y + r);
      ctx.lineTo(p.x - r, p.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawSensors(): void {
    const ctx = this.ctx;
    for (const s of this.world.city.sensors) {
      const p = this.toScreen(s.x, s.y);
      ctx.strokeStyle = 'rgba(255, 181, 71, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 520 * this.scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const s of this.world.city.sensors) {
      const p = this.toScreen(s.x, s.y);
      ctx.fillStyle = '#ffb547';
      ctx.strokeStyle = '#05090d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2.5, 4 * this.scale), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawCctv(): void {
    const ctx = this.ctx;
    for (const c of this.world.city.cctv) {
      const p = this.toScreen(c.x, c.y);
      const r = Math.max(3.5, 5 * this.scale);
      ctx.fillStyle = '#a38bff';
      ctx.strokeStyle = '#05090d';
      ctx.lineWidth = 1.5;
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
    }
  }

  private tripsToday(day: number): Map<number, Trip[]> {
    if (this.tripCacheDay !== day) {
      this.tripCache.clear();
      this.tripCacheDay = day;
      for (const v of this.world.vehicles) this.tripCache.set(v.id, this.world.vehicleTrips(v.id, day));
    }
    return this.tripCache;
  }

  /** Cars on the road right now. */
  movingVehicles(now: number): { id: number; x: number; y: number; heading: number }[] {
    const out: { id: number; x: number; y: number; heading: number }[] = [];
    for (const [id, trips] of this.tripsToday(dayOf(now))) {
      for (const trip of trips) {
        if (now >= trip.depart && now < trip.arrive) {
          out.push({ id, ...tripPosition(trip, now) });
          break;
        }
      }
    }
    return out;
  }

  private drawTraffic(now: number): void {
    const ctx = this.ctx;
    this.drawn = [];
    const len = Math.max(7.5, Math.min(14, 12 * this.scale));
    const wid = len * 0.55;
    for (const car of this.movingVehicles(now)) {
      const p = this.toScreen(car.x, car.y);
      if (p.x < -20 || p.y < -20 || p.x > this.width + 20 || p.y > this.height + 20) continue;
      this.drawn.push({ id: car.id, sx: p.x, sy: p.y });
      const v = this.world.vehicles[car.id] as Vehicle;
      // drive on the right
      const off = 3.2 * this.scale;
      const ox = -Math.sin(car.heading) * off * -1;
      const oy = Math.cos(car.heading) * off;
      ctx.save();
      ctx.translate(p.x + ox, p.y + oy);
      ctx.rotate(car.heading);
      ctx.fillStyle = COLOR_HEX[v.color] ?? '#ccc';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-len / 2, -wid / 2, len, wid, 1.5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 250, 220, 0.85)';
      ctx.fillRect(len / 2 - 1.5, -wid / 2 + 0.5, 1.5, 1.4);
      ctx.fillRect(len / 2 - 1.5, wid / 2 - 1.9, 1.5, 1.4);
      ctx.restore();
      if (this.highlight.has(car.id)) {
        ctx.strokeStyle = '#39d0ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, len + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = '600 11px "IBM Plex Mono", monospace';
        ctx.fillStyle = '#39d0ff';
        ctx.textAlign = 'left';
        ctx.fillText(v.plate, p.x + len + 7, p.y - 6);
      }
    }
    // highlighted cars that are parked
    for (const id of this.highlight) {
      if (this.drawn.some((d) => d.id === id)) continue;
      const pos = this.world.positionAt(this.world.driverAt(id, now), now);
      if (pos.place === null || this.world.city.places[pos.place]?.kind === 'outside') continue;
      const p = this.toScreen(pos.x, pos.y);
      ctx.strokeStyle = '#39d0ff';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '600 11px "IBM Plex Mono", monospace';
      ctx.fillStyle = '#39d0ff';
      ctx.textAlign = 'left';
      ctx.fillText(`${(this.world.vehicles[id] as Vehicle).plate} · parked`, p.x + 16, p.y - 4);
      this.drawn.push({ id, sx: p.x, sy: p.y });
    }
  }

  private drawPhones(now: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(163, 139, 255, 0.55)';
    const r = Math.max(1.2, 1.8 * this.scale);
    for (const person of this.world.people) {
      if (person.hidden || !person.phone.carried) continue;
      const pos = this.world.positionAt(person.id, now);
      if (pos.place !== null && this.world.city.places[pos.place]?.kind === 'outside') continue;
      // spread people out around the building they're in
      const jx = pos.place !== null ? (((person.id * 37) % 21) - 10) * 0.9 : 0;
      const jy = pos.place !== null ? (((person.id * 53) % 17) - 8) * 0.9 : 0;
      const p = this.toScreen(pos.x + jx, pos.y + jy);
      if (p.x < 0 || p.y < 0 || p.x > this.width || p.y > this.height) continue;
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers for overlays

  drawRect(r: Rect, color: string, dashed = false): void {
    const ctx = this.ctx;
    const a = this.toScreen(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1));
    const b = this.toScreen(Math.max(r.x0, r.x1), Math.max(r.y0, r.y1));
    ctx.save();
    ctx.fillStyle = hexAlpha(color, 0.1);
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    if (dashed) ctx.setLineDash([6, 4]);
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.restore();
  }

  pin(x: number, y: number, color: string, label?: string, size = 6): void {
    const ctx = this.ctx;
    const p = this.toScreen(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#05090d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (label) this.tag(p.x + size + 5, p.y, label, color);
  }

  /** A small label box at screen coordinates. */
  tag(sx: number, sy: number, text: string, color: string): void {
    const ctx = this.ctx;
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    const w = ctx.measureText(text).width + 10;
    // flip to the left of the point when it would run off the map
    if (sx + w > this.width - 4) sx = Math.max(4, sx - w - 24);
    ctx.fillStyle = 'rgba(5, 9, 13, 0.88)';
    ctx.fillRect(sx, sy - 9, w, 18);
    ctx.strokeStyle = hexAlpha(color, 0.6);
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy - 8.5, w - 1, 17);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, sx + 5, sy + 0.5);
  }

  path(points: { x: number; y: number }[], color: string, width = 2, dash?: number[]): void {
    if (points.length < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    points.forEach((pt, k) => {
      const p = this.toScreen(pt.x, pt.y);
      if (k === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.restore();
  }
}

export function footprint(p: Place): [number, number] {
  switch (p.kind) {
    case 'home':
    case 'shelter':
      return [22, 16];
    case 'apartment':
      return [30, 24];
    case 'work':
      return p.jobs >= 40 ? [64, 40] : [40, 28];
    case 'health':
      return p.jobs >= 40 ? [64, 44] : [36, 26];
    case 'civic':
    case 'school':
      return [48, 34];
    case 'parking':
      return [56, 36];
    case 'religion':
      return [32, 30];
    default:
      return [30, 22];
  }
}

function shortName(p: Place): string {
  return p.name.replace(/ \((bar|offices|convenience store|immigration)\)$/, '').replace('Port Avery ', '');
}

export function hexAlpha(hex: string, a: number): string {
  const v = hex.replace('#', '');
  const n = parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
