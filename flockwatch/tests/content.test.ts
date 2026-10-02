import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/content/examples';

const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');

describe('citations', () => {
  const sourceIds = [...html.matchAll(/<li id="(s-[\w-]+)">/g)].map((m) => m[1]!);
  const cites = [...html.matchAll(/<a\s+class="cite"\s+href="#(s-[\w-]+)"\s*>(\d+)<\/a\s*>/g)].map((m) => ({ id: m[1]!, n: Number(m[2]) }));

  it('finds the sources and the citations', () => {
    expect(sourceIds.length).toBeGreaterThanOrEqual(10);
    expect(cites.length).toBeGreaterThanOrEqual(15);
    // Every cite link in the page was matched by the pattern above.
    expect(cites.length).toBe((html.match(/class="cite"/g) ?? []).length);
  });

  it('numbers each citation by its source’s place in the list', () => {
    for (const { id, n } of cites) expect(sourceIds.indexOf(id) + 1, `citation [${n}] → ${id}`).toBe(n);
  });

  it('cites every source, in order of first use', () => {
    const firstUse = [...new Set(cites.map((c) => c.id))];
    expect(firstUse).toEqual(sourceIds);
  });

  it('links every source to a page', () => {
    for (const id of sourceIds) {
      const item = html.slice(html.indexOf(`<li id="${id}">`), html.indexOf('</li>', html.indexOf(`<li id="${id}">`)));
      expect(item, id).toMatch(/<a href="https:\/\/[^"]+"/);
    }
  });
});

describe('page copy', () => {
  it('uses typographic apostrophes in prose', () => {
    const text = html
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/https?:\/\/\S+/g, '');
    expect(text).not.toMatch(/\w'\w/);
  });

  it('labels the sample capture as an illustration', () => {
    expect(html).toContain('Not a real record.');
  });
});

describe('example routes', () => {
  it('start and end inside the United States', () => {
    for (const ex of EXAMPLES) {
      for (const p of [ex.from, ex.to]) {
        expect(p.lat, ex.label).toBeGreaterThan(18);
        expect(p.lat, ex.label).toBeLessThan(72);
        expect(p.lon, ex.label).toBeGreaterThan(-180);
        expect(p.lon, ex.label).toBeLessThan(-64);
      }
    }
  });
});
