import { expect, it } from 'vitest';
import { CASES } from '../src/core/cases';
import { ABSURD, CAPITAL, SLACK } from '../src/core/sentence';
import { INTRO_MS, lineMs, OBJECTION_MS, RULING_MS } from '../src/core/timing';

it('has unique ids and a healthy mix of silly and serious', () => {
  expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  expect(CASES.filter((c) => c.tone === 'silly').length).toBeGreaterThanOrEqual(6);
  expect(CASES.filter((c) => c.tone === 'serious').length).toBeGreaterThanOrEqual(6);
});

it.each(CASES.map((c) => [c.id, c] as const))('%s plays in 45 seconds or less', (_, kase) => {
  let ms = INTRO_MS + RULING_MS + kase.lines.reduce((sum, l) => sum + lineMs(l.text), 0);
  if (kase.objection) ms += Math.min(OBJECTION_MS, lineMs(kase.objection.text)) + lineMs(kase.objection.overruled.text);
  expect(ms).toBeLessThanOrEqual(45_000);
});

it.each(CASES.map((c) => [c.id, c] as const))('%s is complete', (_, kase) => {
  const [lo, hi] = kase.fair;
  expect(lo).toBeLessThanOrEqual(hi);
  expect(kase.crowd).toBeGreaterThanOrEqual(0);
  expect(kase.crowd).toBeLessThanOrEqual(10);
  expect(kase.lines.length).toBeGreaterThanOrEqual(4);
  expect(kase.lines.some((l) => l.who === 'pros')).toBe(true);
  expect(kase.lines.some((l) => l.who === 'def')).toBe(true);
  expect(kase.gallery.length).toBeGreaterThanOrEqual(2);
  for (const line of kase.lines) expect(line.text.length).toBeLessThanOrEqual(160);
  if (kase.lines.some((l) => l.who === 'witness')) expect(kase.witness).toBeDefined();
  if (kase.objection) expect(kase.objection.after).toBeLessThan(kase.lines.length);
  // Every headline a ruling can reach is written.
  if (lo - SLACK > 0) expect(kase.headlines.lenient ?? kase.headlines.free).toBeDefined();
  if (lo - SLACK > 0 && !kase.headlines.free) expect(kase.headlines.lenient).toBeDefined();
  if (hi + SLACK < 10) expect(kase.headlines.harsh).toBeDefined();
  // Without its own absurd headline, a case falls back to a generic one; the
  // serious ones should have their own.
  if (kase.tone !== 'mixed' && (hi + ABSURD <= 10 || hi < CAPITAL)) expect(kase.headlines.absurd).toBeDefined();
});
