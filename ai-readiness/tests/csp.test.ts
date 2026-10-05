/**
 * The page's Content-Security-Policy (vercel.json) forbids inline scripts,
 * except the theme script the build writes into index.html, allowed by its
 * hash. Change scripts/theme-init.js and this test prints the new hash to
 * paste into vercel.json.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cspHash, themeScript } from '../scripts/inline.ts';

interface VercelConfig {
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

const vercel = JSON.parse(readFileSync(resolve(import.meta.dirname, '../vercel.json'), 'utf8')) as VercelConfig;
const csp = vercel.headers.find((h) => h.source === '/(.*)')?.headers.find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src')) ?? '';

describe('Content-Security-Policy', () => {
  it('allows the inline theme script by its current hash', () => {
    const hash = cspHash(themeScript());
    expect(scriptSrc, `vercel.json: put ${hash} in script-src (scripts/theme-init.js changed)`).toContain(hash);
  });

  it('allows no other inline script', () => {
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc.match(/'sha256-/g) ?? []).toHaveLength(1);
  });

  it('keeps everything else on this site', () => {
    for (const directive of ["default-src 'self'", "connect-src 'self'", "frame-ancestors 'none'", "object-src 'none'"]) expect(csp).toContain(directive);
  });
});
